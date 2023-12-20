import {
    ui_model,
    ui_latent,
    ui_sampler,
    ui_highresfix,
    run_model,
    run_prompt,
    run_latent,
    util_expandBrances,
    run_sampler,
    run_saves_was,
    ui_save,
    ui_preprocessor,
    run_preprocessor,
    run_highresfix,
} from '../_prefabs/_prefabs'

app({
    ui: (form) => ({
        positive: form.prompt({ default: 'masterpiece, detailed, ' }),
        negative: form.prompt({ default: '(child, loli), low res, low quality, text, ' }),
        model: ui_model(form),
        latent: ui_latent(form),
        sampler: ui_sampler(form),

        seed: form.seed({}),
        highResFix: ui_highresfix(form),
        ControleNet: form.list({
            min: 0,
            element: () =>
                form.group({
                    layout: 'V',

                    items: () => ({
                        Image: form.image({}),
                        controleModel: form.enum({
                            label: 'controleModel',
                            enumName: 'Enum_ControlNetLoader_control_net_name',
                        }),
                        strength: form.float({ min: 0, max: 1, step: 0.01, default: 1 }),
                        resize: form.boolean({ label: 'resize', default: true }),
                        preprocessor: ui_preprocessor(form, 'OpenPose'),
                    }),
                }),
        }),
        save: ui_save(form),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes
        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt, vae, clip } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const x = run_prompt(flow, { richPrompt: p.positive, clip, ckpt })
        const clipPos = x.clip
        const ckptPos = x.ckpt
        let positive = x.text

        const y = run_prompt(flow, { richPrompt: p.negative, clip, ckpt })
        let negative = graph.CLIPTextEncode({ clip, text: y.text })

        // START IMAGE -------------------------------------------------------------------------------
        const res = await run_latent({ flow, opts: p.latent, vae })
        const baseLatent = res.latent

        // ------------------------------------------------------

        let posit_text = util_expandBrances(`${positive}`)
        for (const text of posit_text) {
            let clipControle: ControlNetApplyAdvanced | undefined
            for (const controlenet of p.ControleNet) {
                let imageData = await flow.loadImageAnswer(controlenet.Image)

                let image = imageData._IMAGE
                if (controlenet.resize) {
                    image = graph.Image_Resize({
                        image,
                        mode: 'resize',
                        resampling: 'bicubic',
                        supersample: 'false',
                        resize_width: res.width,
                        resize_height: res.height,
                    }).outputs.IMAGE
                }
                clipControle = graph.ControlNetApplyAdvanced({
                    control_net: graph.ControlNetLoader({ control_net_name: controlenet.controleModel }),
                    image: run_preprocessor({ flow, image, preprocessor: controlenet.preprocessor }) ?? image,
                    positive: clipControle?.outputs.positive ?? graph.CLIPTextEncode({ clip, text: text }),
                    negative: clipControle?.outputs.negative ?? graph.CLIPTextEncode({ clip, text: y.text }),
                    strength: controlenet.strength,
                })
            }
            let LATENT: _LATENT = baseLatent
            // 1️⃣ FIRST PASS --------------------------------------------------------
            let image = run_sampler({
                ckpt: ckptPos,
                clip: clipPos,
                vae,
                flow,
                latent: LATENT,
                model: p.sampler,
                positive: clipControle?.outputs.positive ?? text,
                negative: clipControle?.outputs.negative ?? negative,
                preview: p.highResFix == null, // || // p.highResFix.saveIntermediaryImage,
            })
            LATENT = image.latent

            // 3️⃣ upscale latent (a.k.a. highres fix) ---------------------------------------------------------
            if (p.highResFix) {
                LATENT = run_highresfix({
                    flow,
                    latentInput: LATENT,
                    ckpt: ckptPos,
                    clip: clipPos,
                    vae,
                    latent_ui: p.latent,
                    sampler_ui: p.sampler,
                    highresfix: p.highResFix,
                    positive: text,
                    negative: negative,
                    preview: true,
                }).latent
            }
            if (p.save) {
                run_saves_was({ flow, opts: p.save, image: graph.VAEDecode({ vae, samples: LATENT }) })
            }
        }

        await flow.PROMPT()
    },
})
