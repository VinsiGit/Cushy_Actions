import { ui_model, ui_latent, ui_sampler, run_latent, run_model, run_prompt, run_sampler } from '../_prefabs/_prefabs'

action({
    // author: 'VinsiGit',
    // name: 'Game',
    // description: 'Play',
    ui: (form) => ({
        positive: form.prompt({}),
        negative: form.prompt({ default: '(child:1.2, loli:1.2), nsfw, nude' }),

        model: ui_model(form),
        latent: ui_latent(form),
        sampler: ui_sampler(form),
        loras: form.loras({ default: [] }),
        // controlnet: form.
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

        // MangaLora ----------------------------------------------------------------------------------
        const loraManga = graph.LoraLoader({
            lora_name: 'Style\\Lineart\\animeLineartMangaLike_v30MangaLike.safetensors',
            model: ckpt,
            clip: clip,
        })

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

        let ckptManga = loraManga.outputs.MODEL
        let clipManga = loraManga.outputs.CLIP
        // START IMAGE -------------------------------------------------------------------------------
        const res = await run_latent({ flow, opts: p.latent, vae })
        const LATENT = res.latent
        const positiveManga = positive + ', manga, monochrome'
        const sampleManga = run_sampler({
            ckpt: ckptManga,
            clip: clipManga,
            vae,
            flow,
            latent: LATENT,
            model: p.sampler,
            positive: positiveManga,
            negative: negative,
            preview: true,
        })

        // Colorize ----------------------------------------------------------------------------------

        await flow.PROMPT()
    },
})
