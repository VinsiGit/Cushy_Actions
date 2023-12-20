import {
    ui_model,
    ui_latent,
    ui_sampler,
    run_latent,
    run_model,
    run_prompt,
    run_sampler,
    run_preprocessor,
    ui_preprocessor,
    run_highresfix,
    ui_highresfix,
    util_expandBrances,
} from '../_prefabs/_prefabs'

app({
    // author: 'VinsiGit',
    // name: 'MangaMaker',
    // description: 'Make a Manga',
    ui: (form) => ({
        positive: form.prompt({ label: 'Main prompt' }),
        color: form.string({ default: '', textarea: true }),

        negative: form.prompt({ default: '(child:1.2, loli:1.2), nsfw, nude' }),

        model: ui_model(form),
        latent: ui_latent(form),
        sampler: ui_sampler(form),

        loraManga: form.group({
            items: () => ({
                model: form.enum({
                    enumName: 'Enum_LoraLoader_lora_name',
                    default: 'Normal\\Style\\Lineart\\animeLineartMangaLike_v30MangaLike.safetensors',
                }),
                strength: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),

                // strength_model: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
                // strength_clip: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
            }),
        }),
        makeImage: form.groupOpt({
            default: false,
            label: 'Make first image',
            tooltip: 'skips the latent, sampler and lora Manga',
            items: () => ({
                image: form.image({}),
                resize: form.groupOpt({
                    items: () => ({
                        size: form.size({ group: 'latent', step: 128, min: 0, max: 2048 }),
                    }),
                }),
            }),
        }),
        controleNet: form.group({
            items: () => ({
                preprocessor: ui_preprocessor(form, 'Lineart'),
                controleModel: form.enum({
                    enumName: 'Enum_ControlNetLoader_control_net_name',
                    default: 'control_v11p_sd15s2_lineart_anime_fp16.safetensors',
                }),
                colorStrength: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
            }),
        }),
        loraColor: form.groupOpt({
            items: () => ({
                model: form.enum({
                    enumName: 'Enum_LoraLoader_lora_name',
                    default: 'Normal\\Style\\Lineart\\colorize.safetensors',
                }),
                strength: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),

                // strength_model: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
                // strength_clip: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
            }),
        }),
        //adult, retro,  detailed, background, day, big eyes, sick, vampire teeth
        samplerColor: ui_sampler(form),
        highResFix: ui_highresfix(form),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes

        const controlnet = graph.ControlNetLoader({ control_net_name: p.controleNet.controleModel })

        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt: ckptBase, vae, clip: clipBase } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const x = run_prompt(flow, { richPrompt: p.positive, clip: clipBase, ckpt: ckptBase })
        let ckpt = x.ckpt
        let clip = x.clip
        let positive = x.text

        const y = run_prompt(flow, { richPrompt: p.negative, clip: clipBase, ckpt: ckptBase })
        let negative = graph.CLIPTextEncode({ clip: clipBase, text: y.text })

        // MangaLora ----------------------------------------------------------------------------------
        const loraManga = graph.LoraLoader({
            lora_name: p.loraManga.model,
            model: ckpt,
            clip: clip,
            strength_clip: p.loraManga.strength,
            strength_model: p.loraManga.strength,
        })

        let ckptManga = loraManga.outputs.MODEL
        let clipManga = loraManga.outputs.CLIP
        let negativeManga = graph.CLIPTextEncode({ clip: clipManga, text: y.text })

        // START IMAGE -------------------------------------------------------------------------------
        let image: any
        let sampleManga: any
        let posit_text = util_expandBrances(`${positive}`)
        for (const text of posit_text) {
            if (p.makeImage) {
                let makeImage = p.makeImage
                image = await (await flow.loadImageAnswer(makeImage.image))._IMAGE
                if (makeImage.resize) {
                    image = graph.Image_Resize({
                        image,
                        mode: 'resize',
                        resampling: 'bicubic',
                        supersample: 'false',
                        resize_width: makeImage.resize.size.width,
                        resize_height: makeImage.resize.size.height,
                    }).outputs.IMAGE
                }
            } else {
                const res = await run_latent({ flow, opts: p.latent, vae })
                const LATENT = res.latent
                const positiveManga = text + ', lineart, monochrome'
                sampleManga = run_sampler({
                    ckpt: ckptManga,
                    clip: clipManga,
                    vae,
                    flow,
                    latent: LATENT,
                    model: p.sampler,
                    positive: positiveManga,
                    negative: negativeManga,
                    preview: true,
                })
            }

            // Colorize ----------------------------------------------------------------------------------
            if (p.loraColor) {
                const lora = p.loraColor
                const loraColor = graph.LoraLoader({
                    lora_name: lora.model,
                    model: ckpt,
                    clip: clip,
                    strength_clip: lora.strength,
                    strength_model: lora.strength,
                })
                ckpt = loraColor.outputs.MODEL
                clip = loraColor.outputs.CLIP
            }
            let positiveColor = graph.CLIPTextEncode({ clip, text: p.color + ', ' + text })
            let negativeColor = graph.CLIPTextEncode({ clip, text: y.text })
            let clipColor = graph.ControlNetApplyAdvanced({
                control_net: controlnet,
                image: run_preprocessor({
                    flow,
                    image: image ?? sampleManga.image,
                    preprocessor: p.controleNet.preprocessor,
                    preview: false,
                }),
                positive: positiveColor,
                negative: negativeColor,
                strength: p.controleNet.colorStrength,
            })
            let Image = run_sampler({
                ckpt,
                clip,
                vae,
                flow,
                latent: graph.VAEEncode({ pixels: image ?? sampleManga.image, vae }),
                model: p.samplerColor,
                positive: clipColor.outputs.positive,
                negative: clipColor.outputs.negative,
                preview: true,
            })
            if (p.highResFix) {
                run_highresfix({
                    flow,
                    latentInput: Image.latent,
                    ckpt,
                    clip,
                    vae,
                    latent_ui: p.latent,
                    sampler_ui: p.sampler,
                    highresfix: p.highResFix,
                    positive: positiveColor,
                    negative: negativeColor,
                })
            }
        }
        await flow.PROMPT()
    },
})
