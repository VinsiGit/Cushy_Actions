import {
    ui_model,
    ui_latent,
    ui_sampler,
    run_model,
    run_prompt,
    run_latent,
    util_expandBrances,
    run_sampler,
    ui_highresfix,
    run_highresfix,
    ui_preprocessor,
    run_preprocessor,
} from '../_prefabs/_prefabs'

app({
    // author: 'VinsiGit',
    // name: 'IPAdapter V0.8',
    // description: 'Make a Image',
    ui: (form) => ({
        // startImage: startImage_widget(form),
        positive: form.prompt({ label: 'Positive prompt' }),
        negative: form.prompt({ label: 'Negative prompt', default: '(child:1.2, loli:1.2), nsfw, nude' }),

        model: ui_model(form),
        xl: form.boolean({ label: 'XL model', default: false }),
        latent: ui_latent(form),
        sampler: ui_sampler(form),
        highResFix: ui_highresfix(form),
        resize: form.groupOpt({
            items: () => ({
                size: form.float({ min: 1, max: 4, step: 0.1, default: 1 }),
            }),
        }),
        ipadapter: form.group({
            items: () => ({
                weight: form.float({ min: 0, max: 1, step: 0.01, default: 1, tooltip: 'allow for -1 to 3', group: 'Ipadapter' }),
                noise: form.float({ min: 0, max: 1, step: 0.01, default: 0, group: 'Ipadapter' }),
            }),
        }),
        Images: form.list({
            min: 1,
            element: () =>
                form.group({
                    layout: 'V',

                    items: () => ({
                        Image: form.image({}),
                        interpolation: form.enum({
                            label: 'interpolation',
                            enumName: 'Enum_PrepImageForClipVision_interpolation',
                            default: 'LANCZOS',
                        }),
                        position: form.enum({
                            label: 'position',
                            enumName: 'Enum_PrepImageForClipVision_crop_position',
                            default: 'top',
                        }),
                        sharpening: form.float({ min: 0, max: 1, step: 0.01, default: 0 }),
                    }),
                }),
        }),
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
                        cut: form.groupOpt({
                            items: () => ({
                                relative: form.boolean({ label: 'relative resize', default: true }),
                                size: form.float({ min: 0, max: 1, step: 0.01, default: 0.5 }),
                                // cuting: form.groupOpt({
                                //     items: () => ({
                                //         start_x: form.float({ min: 0, max: 2048, step: 64, default: 0 }),
                                //         start_y: form.float({ min: 0, max: 2048, step: 64, default: 0 }),
                                //         end_x: form.float({ min: 0, max: 2048, step: 64, default: 512 }),
                                //         end_y: form.float({ min: 0, max: 2048, step: 64, default: 512 }),
                                //     }),
                                // }),
                            }),
                        }),
                        strength: form.float({ min: 0, max: 1, step: 0.01, default: 1 }),
                        resize: form.boolean({ label: 'resize', default: true }),
                        preprocessor: ui_preprocessor(form, 'OpenPose'),
                    }),
                }),
        }),
    }),
    run: async (flow, p) => {
        const graph = flow.nodes

        // IPAdapterModelLoader -----------------------------------------------------------------------
        let IPAdapterModel
        if (p.xl) {
            IPAdapterModel = graph.IPAdapterModelLoader({ ipadapter_file: 'ip-adapter-plus_sdxl_vit-h.bin' })
        } else {
            IPAdapterModel = graph.IPAdapterModelLoader({ ipadapter_file: 'ip-adapter-plus_sd15.bin' })
        }

        const CLIPPModel = graph.CLIPVisionLoader({ clip_name: 'model_sd.safetensors' })
        // MODEL, clip skip, vae, etc. ---------------------------------------------------------------
        let { ckpt, vae, clip } = run_model(flow, p.model)

        // RICH PROMPT ENGINE -------- ---------------------------------------------------------------
        const x = run_prompt(flow, { richPrompt: p.positive, clip, ckpt })
        let clipPos = x.clip
        const ckptPos = x.ckpt
        let positive = x.text

        const y = run_prompt(flow, { richPrompt: p.negative, clip, ckpt })
        let negative = y.text
        // START IMAGE -------------------------------------------------------------------------------
        let latent = await run_latent({ flow, opts: p.latent, vae })

        const PrepImage = async (ImageItem: (typeof p)['Images'][number]): Promise<_IMAGE> => {
            const image: _IMAGE = graph.PrepImageForClipVision({
                image: await flow.loadImageAnswer(ImageItem.Image),
                interpolation: ImageItem.interpolation,
                crop_position: ImageItem.position,
                sharpening: ImageItem.sharpening,
            })

            return image
        }

        let ckptModel

        let batch: _IMAGE = await PrepImage(p.Images[0])

        if (p.Images.length == 2) {
            let image2 = await PrepImage(p.Images[1])

            batch = graph.ImageBatch({ image1: batch, image2: image2 })
        } else if (p.Images.length > 2) {
            for (let i = 1; i < p.Images.length; i++) {
                batch = graph.ImageBatch({
                    image1: batch,
                    image2: await PrepImage(p.Images[i]),
                })
            }
        }
        ckptModel = graph.IPAdapterApply({
            clip_vision: CLIPPModel,
            ipadapter: IPAdapterModel,
            image: batch,
            model: ckpt,
            weight: p.ipadapter.weight,
            noise: p.ipadapter.noise,
        }).outputs.MODEL

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
                        resampling: 'bilinear',
                        supersample: 'false',
                        resize_width: latent.width,
                        resize_height: latent.height,
                    }).outputs.IMAGE
                }
                clipControle = graph.ControlNetApplyAdvanced({
                    control_net: graph.ControlNetLoader({ control_net_name: controlenet.controleModel }),
                    image: run_preprocessor({ flow, image, preprocessor: controlenet.preprocessor }) ?? image,
                    positive: clipControle?.outputs.positive ?? graph.CLIPTextEncode({ clip, text: x.text }),
                    negative: clipControle?.outputs.negative ?? graph.CLIPTextEncode({ clip, text: negative }),
                    strength: controlenet.strength,
                })
            }
            let Image = run_sampler({
                ckpt: ckptModel,
                clip: clipPos,
                vae,
                flow,
                latent: latent.latent,
                model: p.sampler,
                positive: clipControle?.outputs.positive ?? text,
                negative: clipControle?.outputs.negative ?? negative,
                preview: true,
            })
            // 3️⃣ upscale latent (a.k.a. highres fix) ---------------------------------------------------------
            if (p.highResFix) {
                Image = run_highresfix({
                    flow,
                    latentInput: Image.latent,
                    ckpt: ckptModel,
                    clip: clipPos,
                    vae,
                    latent_ui: p.latent,
                    sampler_ui: p.sampler,
                    highresfix: p.highResFix,
                    positive: clipControle?.outputs.positive ?? text,
                    negative: clipControle?.outputs.negative ?? negative,
                })
            }
            if (p.resize) {
                let highresscale = p.highResFix?.scaleFactor ?? 1
                // flow.output_text(highresscale.toString())
                let latent = graph.EmptyLatentImage({
                    batch_size: 1,
                    height: p.latent.size.height * p.resize.size * highresscale,
                    width: p.latent.size.width * p.resize.size * highresscale,
                })
                clipControle = graph.ControlNetApplyAdvanced({
                    control_net: graph.ControlNetLoader({ control_net_name: 'control_v11f1e_sd15_tile_fp16.safetensors' }),
                    image: graph.VAEDecode({ vae, samples: Image.latent }),
                    positive: graph.CLIPTextEncode({ clip, text: x.text }), //clipControle?.outputs.positive ??
                    negative: graph.CLIPTextEncode({ clip, text: negative }), //clipControle?.outputs.negative ??
                    strength: 1,
                })
                Image = run_sampler({
                    ckpt: ckptModel,
                    clip: clipPos,
                    vae,
                    flow,
                    latent,
                    model: p.sampler,
                    positive: clipControle?.outputs.positive ?? text,
                    negative: clipControle?.outputs.negative ?? negative,
                    preview: true,
                })
            }
        }

        await flow.PROMPT()
    },
})
