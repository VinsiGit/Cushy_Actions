import main from 'electron/main'
import type { WidgetPromptOutput } from 'src/widgets/prompter/WidgetPromptUI'
import {
    run_Detailer,
    run_latent,
    run_model,
    run_prompt,
    run_sampler,
    run_tile,
    ui_highresfix,
    ui_latent,
    ui_model,
    ui_sampler,
    ui_tile,
} from '../_prefabs/_prefabs'

action({
    ui: (form) => ({
        positiveMain: form.prompt({ default: 'texture, 2d texture, detailed, masterpiece, ' }),
        positive: form.prompt({ label: 'promptCenter' }),
        positiveOpt: form.promptOpt({ label: 'promptCorner' }),
        denoise2: form.float({ label: 'denoiseCenter', min: 0, max: 1, step: 0.01, default: 0.6 }),
        denoise1: form.float({ label: 'denoiseCorner', min: 0, max: 1, step: 0.01, default: 0.75 }),
        negative: form.prompt({ default: 'child, loli, text, watermark' }),

        model: ui_model(form),

        latent: ui_latent(form),
        sampler: ui_sampler(form),
        SAM: form.enumOpt({ enumName: 'Enum_SAMLoader_model_name' }),
        bbox_detectors: form.list({
            element: () =>
                form.enum({
                    enumName: 'Enum_UltralyticsDetectorProvider_model_name',
                    // default: 'bbox/face_yolov8m.pt',
                }),
        }),
        tile: ui_tile(form),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes

        let SAM
        if (p.SAM) {
            SAM = graph.SAMLoader({ device_mode: 'AUTO', model_name: p.SAM })
        }
        const I = await flow.loadImageSDK()
        const W = 512
        const H = 512
        const mkImage = () => {
            const container: HTMLDivElement = I.createContainer()
            const stage = new I.Stage({ container: container, width: W, height: H })
            const layer = new I.Layer()
            stage.add(layer)
            return { container, stage, layer }
        }
        // let imageLoad = await I.loadImage('library/VinsiGit/Cushy_Action/_assets/hedron - 512x512.png')
        let imageLoad = await I.loadImage('library/VinsiGit/Cushy_Action/_assets/PlusCircle-512.png')
        const maskImg = new I.Image({ image: imageLoad })

        const base = mkImage()
        base.layer.add(maskImg)

        base.stage.draw()

        const dataURL_base = base.stage.toDataURL({ width: W, height: H })
        let imageMask = await flow.load_dataURL(dataURL_base)

        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt, vae, clip } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const combinedPrompt1: WidgetPromptOutput = {
            tokens: [
                //
                ...p.positiveMain.tokens,
                ...p.positive.tokens,
            ],
        }
        const combinedPrompt2: WidgetPromptOutput = {
            tokens: [
                //
                ...p.positiveMain.tokens,
                ...(p.positiveOpt?.tokens ?? p.positive.tokens),
            ],
        }

        const main = run_prompt(flow, { richPrompt: combinedPrompt1, clip, ckpt })
        const ckptMain = main.ckpt
        const clipMain = main.clip
        const positiveMain = graph.CLIPTextEncode({ clip: clipMain, text: main.text })

        const Opt = run_prompt(flow, { richPrompt: combinedPrompt2, clip, ckpt })
        const ckptOpt = Opt.ckpt
        const clipOpt = Opt.clip
        const positiveOpt = graph.CLIPTextEncode({ clip: clipOpt, text: Opt.text })

        const y = run_prompt(flow, { richPrompt: p.negative, clip, ckpt })
        const negative = graph.CLIPTextEncode({ clip, text: y.text })

        // START IMAGE -------------------------------------------------------------------------------
        const latent = await run_latent({ flow, opts: p.latent, vae })

        const width = p.latent.width
        const height = p.latent.height

        let image: _IMAGE = run_sampler({
            ckpt: ckptMain,
            clip: clipMain,
            vae,
            flow,
            latent: latent.latent,
            model: p.sampler,
            positive: positiveMain,
            negative: negative,
            preview: true,
        }).image

        let imageNeo: _IMAGE = image
        for (let i of [-width / 2, width / 2]) {
            for (let j of [-height / 2, height / 2]) {
                imageNeo = graph.Image_Transpose({ image: imageNeo, image_overlay: image, width, height, X: i, Y: j })
                // graph.PreviewImage({ images: imageNeo })
            }
        }
        graph.PreviewImage({ images: imageNeo })

        const mask = await graph.ImageToMask({
            image: graph.Image_Resize({
                image: imageMask,
                mode: 'resize',
                resampling: 'bilinear',
                supersample: 'false',
                resize_width: width,
                resize_height: height,
            }),
            channel: 'green',
        })

        let latentNeo = graph.SetLatentNoiseMask({ mask: mask, samples: graph.VAEEncode({ pixels: imageNeo, vae: vae }) })
        image = run_sampler({
            ckpt: ckptOpt,
            clip: clipOpt,
            vae,
            flow,
            latent: latentNeo,
            model: { ...p.sampler, denoise: p.denoise1 },
            positive: positiveOpt,
            negative: negative,
            preview: true,
        }).image
        imageNeo = image

        for (let i of [-width / 2, width / 2]) {
            for (let j of [-height / 2, height / 2]) {
                imageNeo = graph.Image_Transpose({ image: imageNeo, image_overlay: image, width, height, X: i, Y: j })
                // graph.PreviewImage({ images: imageNeo })
            }
        }
        graph.PreviewImage({ images: imageNeo })
        image = imageNeo

        latentNeo = graph.SetLatentNoiseMask({ mask: mask, samples: graph.VAEEncode({ pixels: image, vae: vae }) })

        image = run_sampler({
            ckpt: ckptMain,
            clip: clipMain,
            vae,
            flow,
            latent: latentNeo,
            model: { ...p.sampler, denoise: p.denoise2 },
            positive: positiveMain,
            negative: negative,
            preview: true,
        }).image

        if (p.bbox_detectors.length > 0) {
            for (const bbox_detectorName of p.bbox_detectors) {
                const bbox_detector = graph.UltralyticsDetectorProvider({ model_name: bbox_detectorName })
                image = run_Detailer({
                    flow,
                    image,
                    vae,
                    bbox_detector,
                    ckpt: ckptMain,
                    clip: clipMain,
                    positive: positiveMain,
                    negative: negative,
                    preview: true,
                    SAM: SAM,
                    guide: true,
                }).image
            }
        }
        image = run_tile({ flow, opts: p.tile, height, width, image })

        await flow.PROMPT({})
    },
})
