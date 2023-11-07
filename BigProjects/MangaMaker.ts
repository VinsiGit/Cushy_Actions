import { ui_model, ui_latent, ui_sampler, run_latent, run_model, run_prompt, run_sampler } from '../_prefabs/_prefabs'

action({
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
                    default: 'Style\\Lineart\\animeLineartMangaLike_v30MangaLike.safetensors',
                }),
                strength_model: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
                strength_clip: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
            }),
        }),
        loras: form.loras({ default: [] }),
        colorStrength: form.float({ default: 1.0, min: 0, max: 1, step: 0.1 }),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes

        const controlnet = graph.ControlNetLoader({ control_net_name: 'control_v11p_sd15s2_lineart_anime_fp16.safetensors' })

        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt: ckptBase, vae, clip: clipBase } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const x = run_prompt(flow, { richPrompt: p.positive, clip: clipBase, ckpt: ckptBase })
        let ckpt = x.ckpt
        let clip = x.clip
        let positive = x.text

        const y = run_prompt(flow, { richPrompt: p.negative, clip: clipBase, ckpt: ckptBase })
        let negative = graph.CLIPTextEncode({ clip: clipBase, text: y.text })
        for (const lora of p.loras) {
            const loraName = lora.name
            const loraStrengthClip = lora.strength_clip
            const loraStrengthModel = lora.strength_model

            let xx = graph.LoraLoader({
                lora_name: loraName,
                model: ckpt,
                clip: clip,
                strength_clip: loraStrengthClip,
                strength_model: loraStrengthModel,
            })
            ckpt = xx.outputs.MODEL
            clip = xx.outputs.CLIP
        }
        // MangaLora ----------------------------------------------------------------------------------
        const loraManga = graph.LoraLoader({
            lora_name: p.loraManga.model,
            model: ckpt,
            clip: clip,
            strength_clip: p.loraManga.strength_model,
            strength_model: p.loraManga.strength_clip,
        })

        let ckptManga = loraManga.outputs.MODEL
        let clipManga = loraManga.outputs.CLIP
        let negativeManga = graph.CLIPTextEncode({ clip: clipManga, text: y.text })

        // START IMAGE -------------------------------------------------------------------------------
        const res = await run_latent({ flow, opts: p.latent, vae })
        const LATENT = res.latent
        const positiveManga = positive + ', lineart, monochrome'
        const sampleManga = run_sampler({
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

        // Colorize ----------------------------------------------------------------------------------

        let clipColor = graph.ControlNetApplyAdvanced({
            control_net: controlnet,
            image: graph.AnimeLineArtPreprocessor({ image: sampleManga.image }),
            positive: graph.CLIPTextEncode({ clip, text: p.color + ', ' + x.text }),
            negative: negative,
            strength: p.colorStrength,
        })
        run_sampler({
            ckpt,
            clip,
            vae,
            flow,
            latent: LATENT,
            model: {
                cfg: p.sampler.cfg,
                sampler_name: p.sampler.sampler_name,
                scheduler: p.sampler.scheduler,
                steps: p.sampler.steps,
                denoise: 1,
            },
            positive: clipColor.outputs.positive,
            negative: clipColor.outputs.negative,
            preview: true,
        })

        await flow.PROMPT()
    },
})
