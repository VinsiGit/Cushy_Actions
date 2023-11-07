import {
    run_latent,
    run_model,
    run_prompt,
    run_sampler,
    ui_latent,
    ui_latent_Image,
    ui_model,
    ui_sampler,
} from '../_prefabs/_prefabs'

action({
    ui: (form) => ({
        positive: form.prompt({ default: 'texture, 2d texture, ' }),
        negative: form.prompt({ default: 'child, loli, text, watermark' }),
        mask: form.image({}),
        denoise1: form.float({ label: 'denoise', min: 0, max: 1, step: 0.01, default: 0.7 }),
        denoise2: form.float({ label: 'denoise', min: 0, max: 1, step: 0.01, default: 0.55 }),
        model: ui_model(form),

        latent: ui_latent(form),
        sampler: ui_sampler(form),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes

        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt, vae, clip } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const x = run_prompt(flow, { richPrompt: p.positive, clip, ckpt })
        const clipPos = x.clip
        const ckptPos = x.ckpt
        const positive = graph.CLIPTextEncode({ clip, text: x.text })

        const y = run_prompt(flow, { richPrompt: p.negative, clip, ckpt })
        const negative = graph.CLIPTextEncode({ clip, text: y.text })

        // START IMAGE -------------------------------------------------------------------------------
        const latent = await run_latent({ flow, opts: p.latent, vae })

        const width = p.latent.width
        const height = p.latent.height

        let image: _IMAGE = run_sampler({
            ckpt,
            clip,
            vae,
            flow,
            latent: latent.latent,
            model: p.sampler,
            positive: positive,
            negative: negative,
            preview: true,
        }).image
        let imageNeo = image
        for (let i of [-width / 2, width / 2]) {
            for (let j of [-height / 2, height / 2]) {
                imageNeo = graph.Image_Transpose({ image: imageNeo, image_overlay: image, width, height, X: i, Y: j })
                // graph.PreviewImage({ images: imageNeo })
            }
        }
        const mask = await graph.ImageToMask({
            image: graph.Image_Resize({
                image: await flow.loadImageAnswer(p.mask),
                mode: 'resize',
                resampling: 'bilinear',
                supersample: 'false',
                resize_width: p.latent.width,
                resize_height: p.latent.height,
            }),
            channel: 'green',
        })

        let latentNeo = graph.SetLatentNoiseMask({ mask: mask, samples: graph.VAEEncode({ pixels: imageNeo, vae: vae }) })
        image = run_sampler({
            ckpt: ckptPos,
            clip: clipPos,
            vae,
            flow,
            latent: latentNeo,
            model: { ...p.sampler, denoise: p.denoise1 },
            positive: positive,
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
        latentNeo = graph.SetLatentNoiseMask({ mask: mask, samples: graph.VAEEncode({ pixels: imageNeo, vae: vae }) })
        image = run_sampler({
            ckpt: ckptPos,
            clip: clipPos,
            vae,
            flow,
            latent: latentNeo,
            model: { ...p.sampler, denoise: p.denoise2 },
            positive: positive,
            negative: negative,
            preview: true,
        }).image
        await flow.PROMPT({})
    },
})
