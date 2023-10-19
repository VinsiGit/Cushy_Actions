action('The Gradiant Maker (WIP)', {
    author: 'VinsiGit',
    description: 'Gradiant style with clip and lora',
    help: 'WIP',
    ui: (form) => ({
        model: form.enum({
            enumName: 'Enum_CheckpointLoaderSimple_ckpt_name',
            default: 'Normal\\sudachi_v10.safetensors',
            group: 'Model',
        }),

        height: form.int({ default: 768, group: 'latent' }), //normaal 768
        width: form.int({ default: 512, group: 'latent' }),
        flip: form.bool({ default: false, group: 'latent' }),
        batchSize: form.int({ default: 1, min: 1, group: 'latent' }),

        min_denoise: form.float({ default: 0.6, group: 'denoise' }),
        max_denoise: form.float({ default: 0.9, group: 'denoise' }),

        /*rotate: form.int({
            default:0, group: 'change', tooltip: 'rotate in degrees',
        }),*/

        positive: form.promptOpt({ label: 'Positive prompt' }),
        negative: form.promptOpt({ label: 'Negative prompt' }),
        nsfw: form.bool({ default: false }),
        wierd: form.bool({ default: false, tooltip: 'Will make a depth image to be blended with the gradiants' }),

        theme1: form.string({ default: 'theme1', group: 'Theme' }),
        theme2: form.string({ default: 'theme2', group: 'Theme' }),
        theme3: form.string({ default: 'theme3', group: 'Theme' }),
        theme4: form.string({ default: 'theme4', group: 'Theme' }),
        number: form.int({ default: 5, min: 1, tooltip: 'How many will a gradiant be made and bended' }),
        blend_percentage: form.group({
            layout: 'H',
            items: () => ({
                blend_percentage_min: form.float({ default: 0.2, min: 0, max: 1, group: 'blend_percentage' }),
                blend_percentage_max: form.float({ default: 0.6, min: 0, max: 1, group: 'blend_percentage' }),
            }),
        }),
        loras: form.loras({ default: [], group: 'loras' }),

        extra: form.groupOpt({
            layout: 'H',
            items: () => ({
                manga: form.bool({ default: false, label: 'use the animeLineartMangaLike_v30MangaLike lora', group: 'extra' }),
                manga_strength: form.float({ default: 1, min: 0, max: 1, group: 'extra' }),
                face: form.bool({ default: false, group: 'extra' }),
                hands: form.bool({ default: false, group: 'extra' }),
            }),
        }),

        /*
        colors: form.groupOpt({
            items: {
                place: form.int({ default: 0, min: 0, max: 100 }),
                red: form.int({ default: 0, min: 0, max: 255 }),
                green: form.int({ default: 0, min: 0, max: 255 }),
                blue: form.int({ default: 0, min: 0, max: 255 }),
            },
       }),
       */
    }),
    run: async (flow, p) => {
        const graph = flow.nodes
        let height = p.height
        let width = p.width
        if (p.flip) {
            height = p.width
            width = p.height
        }

        // --------------------------------------------------

        const themes = ['theme1', 'theme2', 'theme3', 'theme4'] as const

        const themeFor = { theme1: p.theme1, theme2: p.theme2, theme3: p.theme3, theme4: p.theme4 }

        // --------------------------------------------------

        /*
        console.log(`width : ${width}`)
        console.log(`heightd : ${height}`)
        
        const diagonal = Math.sqrt(width * width + height * height)
        const diagonal_correct = diagonal + (16 - (diagonal % 16))

        console.log(`diagonal : ${diagonal}`)
        console.log(`diagonal_correct : ${diagonal_correct}`)
        */

        function MakeGradient(stops_total: number = 5): {
            gen_Grad: Image_Generate_Gradient
            width_grad: number
            height_grad: number
            width_diff: number
            height_diff: number
            rotate: number
        } {
            const ratio = Math.max(height / width, width / height)
            // const ratio_diagonal = Math.max(diagonal_correct / width, diagonal_correct / height)
            let rotate = Math.floor(Math.random() * 360)
            let angle = (rotate / 180) * Math.PI
            let cos = Math.cos(angle)
            let sin = Math.sin(angle)
            let changer = Math.abs(cos * sin * 2) + ratio

            console.log(`changer : ${changer}`)

            let width_grad = width * changer
            let height_grad = height * changer
            let width_diff = width_grad - width
            let height_diff = height_grad - height
            let gradient_stops = ''
            let index = 0
            let place = 0
            while (index < stops_total) {
                place = place + Math.floor(Math.random() * (100 / stops_total))
                let red = Math.floor(Math.random() * 256)
                let green = Math.floor(Math.random() * 256)
                let blue = Math.floor(Math.random() * 256)
                place = Math.min(place, 100)
                gradient_stops += `${place}:${red},${green},${blue} \n`
                index++
            }
            let direction_fun: Enum_Image_Flip_mode
            if (Math.floor(Math.random() * 2) == 0) {
                direction_fun = 'horizontal'
            } else {
                direction_fun = 'vertical'
            }
            let gen_Grad = graph.Image_Generate_Gradient({
                width: width,
                height: height,
                direction: direction_fun,
                gradient_stops: gradient_stops,
            })
            return { gen_Grad, width_grad, height_grad, width_diff, height_diff, rotate }
        }

        // console.log(`ratio : ${ratio}`);
        // console.log(`width_grad : ${width_grad}`);
        // console.log(`height_grad : ${height_grad}`);

        // graph.PreviewImage({images:MakeGradient().gen_Grad})
        let index = 0

        function blender(times: number = 3, min_blend: number = 0.5, max_blend: number = 0.9) {
            let image: _IMAGE = graph.Image_Blank({ width: width, height: height, red: 255, green: 255, blue: 255 })
            let index = 0
            while (index < Math.max(times, 1)) {
                let gradiant = MakeGradient()
                image = graph.Image_Transpose({
                    image: image,
                    image_overlay: gradiant.gen_Grad,
                    rotation: gradiant.rotate,
                    width: gradiant.width_grad,
                    height: gradiant.height_grad,
                    X: -gradiant.width_diff / 2,
                    Y: -gradiant.height_diff / 2,
                })
                // graph.PreviewImage({ images: image })
                let blend_percentage = Math.random() * (max_blend - min_blend) + min_blend

                image = graph.Image_Blending_Mode({
                    image_a: gradiant.gen_Grad,
                    image_b: image,
                    mode: 'multiply',
                    blend_percentage: blend_percentage,
                })
                index++
            }
            const noise = graph.Image_Voronoi_Noise_Filter({
                width: width,
                height: height,
                density: 32,
                modulator: 8,
                seed: flow.randomSeed(),
            })
            const blend_percentage =
                Math.random() *
                    ((p.blend_percentage?.blend_percentage_max ?? 0.6) - (p.blend_percentage?.blend_percentage_min ?? 0.2)) +
                (p.blend_percentage?.blend_percentage_min ?? 0.2)
            image = graph.Image_Blending_Mode({
                image_a: image,
                image_b: noise,
                mode: 'multiply',
                blend_percentage: blend_percentage,
            })
            graph.PreviewImage({ images: image })
            return image
        }

        // --------------------------------------------------

        // let { negative: bb, positive: aa } = p
        let negative = ''
        let positive = ''
        const nsfw_text = ',(nsfw:1.2), '
        if (p.nsfw) {
            positive += nsfw_text
        } else {
            negative += nsfw_text
        }

        // --------------------------------------------------
        let ckpt = graph.CheckpointLoaderSimple({ ckpt_name: p.model })
        let clipAndModel: HasSingle_CLIP & HasSingle_MODEL = ckpt

        const positivePrompt = p.positive
        if (positivePrompt) {
            for (const tok of positivePrompt.tokens) {
                if (tok.type === 'booru') positive += ` ${tok.tag.text}`
                else if (tok.type === 'text') positive += ` ${tok.text}`
                else if (tok.type === 'embedding') positive += ` embedding:${tok.embeddingName}`
                else if (tok.type === 'wildcard') {
                    const options = (flow.wildcards as any)[tok.payload]
                    if (Array.isArray(options)) positive += ` ${flow.pick(options)}`
                } else if (tok.type === 'lora') {
                    clipAndModel = graph.LoraLoader({
                        model: clipAndModel,
                        clip: clipAndModel,
                        lora_name: tok.loraDef.name,
                        strength_clip: tok.loraDef.strength_clip,
                        strength_model: tok.loraDef.strength_model,
                    })
                }
            }
        }

        const negativePrompt = p.negative
        if (negativePrompt) {
            for (const tok of negativePrompt.tokens) {
                if (tok.type === 'booru') negative += ` ${tok.tag.text}`
                else if (tok.type === 'text') negative += ` ${tok.text}`
                else if (tok.type === 'embedding') negative += ` embedding:${tok.embeddingName}`
                else if (tok.type === 'wildcard') {
                    const options = (flow.wildcards as any)[tok.payload]
                    if (Array.isArray(options)) negative += ` ${flow.pick(options)}`
                } else if (tok.type === 'lora') {
                    flow.print('unsupported: lora in negative prompt; check the default.cushy.ts file')
                    // clipAndModel = graph.LoraLoader({
                    //     model: clipAndModel,
                    //     clip: clipAndModel,
                    //     lora_name: tok.loraName,
                    //     strength_clip: /*lora.strength_clip ??*/ 1.0,
                    //     strength_model: /*lora.strength_model ??*/ 1.0,
                    // })
                }
            }
        }

        const sam_loader = graph.SAMLoader({ model_name: 'sam_vit_b_01ec64.pth', device_mode: 'AUTO' })

        const bbox_detector_face = graph.UltralyticsDetectorProvider({ model_name: 'bbox/face_yolov8m.pt' })

        const bbox_detector_hand = graph.UltralyticsDetectorProvider({ model_name: 'bbox/hand_yolov8s.pt' })._BBOX_DETECTOR

        let face
        let hand
        let lora_manga
        // --------------------------------------------------
        for (const lora of p.loras ?? []) {
            clipAndModel = graph.LoraLoader({
                model: clipAndModel,
                clip: clipAndModel,
                lora_name: lora.name,
                strength_clip: lora.strength_clip ?? 1.0,
                strength_model: lora.strength_model ?? 1.0,
            })
        }
        if (p.extra?.manga) {
            positive += ', manga, lineart, '

            clipAndModel = graph.LoraLoader({
                model: clipAndModel,
                clip: clipAndModel,
                strength_clip: p.extra?.manga_strength ?? 1.0,
                strength_model: p.extra?.manga_strength ?? 1.0,
                lora_name: 'Style\\Lineart\\animeLineartMangaLike_v30MangaLike.safetensors',
            })
        }
        let samples
        let latent = graph.EmptyLatentImage({ height: height, width: width })

        for (const theme of themes) {
            if (p.wierd) {
                samples = graph.RepeatLatentBatch({
                    samples: latent,
                    amount: p.batchSize,
                })
            } else {
                samples = graph.VAEEncode({ pixels: blender(p.number), vae: ckpt })
            }
            console.log(themeFor[theme])
            const positive_clip = graph.CLIPTextEncode({
                clip: clipAndModel,
                text: `${themeFor[theme]}, ${positive}`,
            })
            const negative_clip = graph.CLIPTextEncode({
                clip: lora_manga ?? clipAndModel,
                text: `(chlld:1.2, loli:1.2), ${negative}`,
            })
            if (p.wierd) {
                const pre = graph.MiDaS$7DepthMapPreprocessor({
                    image: graph.VAEDecode({
                        vae: ckpt,
                        samples: graph.KSampler({
                            model: clipAndModel,
                            seed: flow.randomSeed(),
                            latent_image: samples,
                            sampler_name: 'euler',
                            scheduler: 'karras',
                            positive: positive_clip,
                            negative: negative_clip,
                        }),
                    }),
                })._IMAGE
                graph.PreviewImage({ images: pre })

                samples = graph.Image_Blending_Mode({
                    image_a: blender(p.number),
                    image_b: graph.ImpactImageBatchToImageList({ image: pre }),
                    mode: 'add',
                    blend_percentage: 0.5,
                })
                graph.PreviewImage({ images: samples })
                samples = graph.VAEEncode({ pixels: samples, vae: ckpt })
            }

            const image = graph.VAEDecode({
                vae: ckpt,
                samples: graph.KSampler({
                    model: clipAndModel,
                    seed: flow.randomSeed(),
                    latent_image: samples,
                    sampler_name: 'euler',
                    scheduler: 'karras',
                    denoise: Math.random() * (p.max_denoise - p.min_denoise) + p.min_denoise,
                    positive: positive_clip,
                    negative: negative_clip,
                }),
            })
            graph.PreviewImage({ images: image })

            if (p.extra?.face) {
                face = graph.FaceDetailer({
                    image: graph.ImpactImageBatchToImageList({ image: image }),
                    model: clipAndModel,
                    clip: clipAndModel,
                    vae: ckpt,
                    positive: positive_clip,
                    negative: negative_clip,
                    bbox_detector: bbox_detector_face,
                    sam_model_opt: sam_loader,
                    sampler_name: 'ddim',
                    scheduler: 'karras',
                    sam_detection_hint: 'none',
                    sam_mask_hint_use_negative: 'False',
                    wildcard: '',
                }).outputs
                graph.PreviewImage({ images: face.image })
            }
            if (p.extra?.hands) {
                hand = graph.FaceDetailer({
                    image: face?.image ?? graph.ImpactImageBatchToImageList({ image: image }),
                    model: clipAndModel,
                    clip: clipAndModel,
                    vae: ckpt,
                    positive: positive_clip,
                    negative: negative_clip,
                    bbox_detector: bbox_detector_hand,
                    sam_model_opt: sam_loader,
                    sampler_name: 'ddim',
                    scheduler: 'karras',
                    sam_detection_hint: 'none',
                    sam_mask_hint_use_negative: 'False',
                    wildcard: '',
                }).outputs
                graph.PreviewImage({ images: hand.image })
            }
        }

        await flow.PROMPT()
    },
})
