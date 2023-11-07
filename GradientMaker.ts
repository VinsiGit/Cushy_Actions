import { run_Detailer, run_latent, run_model, ui_latent, ui_model } from './_prefabs/_prefabs'

action({
    help: 'WIP',
    ui: (form) => ({
        positive: form.promptOpt({ label: 'Positive prompt' }),
        negative: form.promptOpt({ label: 'Negative prompt', default: 'child, loli, ' }),

        model: ui_model(form),
        latent: ui_latent(form),
        width: form.int({ default: 512, label: 'Width', group: 'latent' }),
        height: form.int({ default: 768, label: 'Height', group: 'latent' }), //normaal 768
        flip: form.bool({ default: false, label: 'Flip', group: 'latent' }),

        min_denoise: form.float({ max: 1, default: 0.6, group: 'denoise' }),
        max_denoise: form.float({ max: 1, default: 0.9, group: 'denoise' }),
        /*rotate: form.int({
            default:0, group: 'change', tooltip: 'rotate in degrees',
        }),*/

        themes: form.list({
            element: () =>
                form.group({
                    layout: 'H',
                    items: () => ({
                        text: form.str({}), //textarea: true
                    }),
                }),
        }),

        random: form.boolean({ default: false, tooltip: 'Random colors for the base image, if off it while be white' }),

        nsfw: form.bool({ default: false }),

        wierd: form.groupOpt({
            layout: 'V',
            items: () => ({
                wierd: form.bool({
                    default: false,
                    label: 'depth',
                    tooltip: 'Will make a depth image to be blended with the gradients',
                }),
                batchSize: form.int({ default: 1, min: 1, tooltip: 'How many depth images do you want per theme?' }),
            }),
        }),

        mode: form.enum({
            enumName: 'Enum_Image_Blending_Mode_mode',
            default: 'multiply',
        }),

        number: form.int({ default: 5, min: 0, tooltip: 'How many will a gradients be made and bended' }),

        total_steps: form.int({
            default: 5,
            min: 1,
            tooltip: 'How many different colors do you want? (random placement and length)',
            label: 'total steps',
        }),

        blend_percentage: form.group({
            layout: 'V',
            items: () => ({
                blend_percentage_min: form.float({ default: 0.2, min: 0, max: 1, group: 'blend_percentage' }),
                blend_percentage_max: form.float({ default: 0.6, min: 0, max: 1, group: 'blend_percentage' }),
            }),
        }),
        loras: form.loras({ default: [], group: 'loras' }),

        extra: form.groupOpt({
            layout: 'V',
            items: () => ({
                manga: form.bool({ default: false, label: 'use the animeLineartMangaLike_v30MangaLike lora', group: 'extra' }),
                manga_strength: form.float({ default: 1, min: 0, max: 1, group: 'extra' }),
                denoise: form.float({ default: 0.5 }),
            }),
        }),
        bbox_detectors: form.list({
            element: () =>
                form.enum({
                    enumName: 'Enum_UltralyticsDetectorProvider_model_name',
                    default: 'bbox/face_yolov8m.pt',
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

        // --------------------------------------------------

        // --------------------------------------------------

        /*
        console.log(`width : ${width}`)
        console.log(`heightd : ${height}`)
        
        const diagonal = Math.sqrt(width * width + height * height)
        const diagonal_correct = diagonal + (16 - (diagonal % 16))

        console.log(`diagonal : ${diagonal}`)
        console.log(`diagonal_correct : ${diagonal_correct}`)
        */

        function MakeGradient(
            stops_total: number = 5,
            width: number = p.width,
            height: number = p.height,
        ): {
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
            // graph.PreviewImage({ images: gen_Grad })

            return { gen_Grad, width_grad, height_grad, width_diff, height_diff, rotate }
        }

        // console.log(`ratio : ${ratio}`);
        // console.log(`width_grad : ${width_grad}`);
        // console.log(`height_grad : ${height_grad}`);

        // graph.PreviewImage({images:MakeGradient().gen_Grad})
        let mode: Enum_Image_Blending_Mode_mode = p.mode
        flow.print(mode)

        function blender(times: number = 3, total_steps: number = 5, min_blend: number = 0.5, max_blend: number = 0.9) {
            let index = 0
            let image: _IMAGE
            if ((p.random ?? false) == true) {
                let red = Math.random() * (255 - 0) + 0
                let green = Math.random() * (255 - 0) + 0
                let blue = Math.random() * (255 - 0) + 0
                image = graph.Image_Blank({ width: width, height: height, red: red, green: green, blue: blue })
            } else {
                image = graph.Image_Blank({ width: width, height: height, red: 255, green: 255, blue: 255 })
            }

            let blend_percentage_first = Math.random() * (max_blend - min_blend) + min_blend

            let image_blend = graph.Image_Blending_Mode({
                image_a: MakeGradient(total_steps, width, height).gen_Grad,
                image_b: image,
                mode,
                blend_percentage: blend_percentage_first,
            })
            // graph.PreviewImage({ images: image_blend })

            while (index < Math.max(times, 0)) {
                let gradient = MakeGradient(total_steps, width, height)
                let blend_percentage = Math.random() * (max_blend - min_blend) + min_blend

                image = graph.Image_Transpose({
                    image: image_blend,
                    image_overlay: gradient.gen_Grad,
                    rotation: gradient.rotate,
                    width: gradient.width_grad,
                    height: gradient.height_grad,
                    X: -gradient.width_diff / 2,
                    Y: -gradient.height_diff / 2,
                })
                blend_percentage = Math.random() * (max_blend - min_blend) + min_blend

                image_blend = graph.Image_Blending_Mode({
                    image_a: image,
                    image_b: image_blend,
                    mode,
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
                flat: 'False',
                RGB_output: 'True',
            })
            const blend_percentage = Math.random() * (max_blend - min_blend) + min_blend
            let image_new = graph.Image_Blending_Mode({
                image_a: image_blend,
                image_b: noise,
                mode,
                blend_percentage: blend_percentage,
            })
            graph.PreviewImage({ images: image_new })
            return image_new
        }

        // --------------------------------------------------

        let { ckpt, vae, clip } = run_model(flow, p.model)

        let positive = p.positive
        let negative = p.negative

        const positive_clip = graph.CLIPTextEncode({ clip, text: positive })
        const negative_clip = graph.CLIPTextEncode({ clip, text: negative })
        let latent = await run_latent({ flow, opts: p.latent, vae })

        const sam_loader = graph.SAMLoader({ model_name: 'sam_vit_b_01ec64.pth', device_mode: 'AUTO' })

        let face
        let hand
        let lora_manga
        // --------------------------------------------------
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
        if (p.extra?.manga) {
            positive += ', manga, lineart, '

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
        let samples

        if (p.themes.length != 0) {
            for (const theme of p.themes) {
                if (p.wierd) {
                    samples = graph.RepeatLatentBatch({
                        samples: latent,
                        amount: p.wierd?.batchSize,
                    })
                } else {
                    samples = graph.VAEEncode({
                        pixels: blender(
                            p.number,
                            p.total_steps,
                            p.blend_percentage.blend_percentage_min,
                            p.blend_percentage.blend_percentage_max,
                        ),
                        vae: vae,
                    })
                }
                const positive_clip = graph.CLIPTextEncode({
                    clip: clipAndModel,
                    text: `${theme.text}, ${positive}`,
                })
                const negative_clip = graph.CLIPTextEncode({
                    clip: lora_manga ?? clipAndModel,
                    text: negative,
                })
                if (p.wierd?.wierd) {
                    const pre = graph.MiDaS$7DepthMapPreprocessor({
                        image: graph.VAEDecode({
                            vae: vae,
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
                        image_a: blender(
                            p.number,
                            p.total_steps,
                            p.blend_percentage.blend_percentage_min,
                            p.blend_percentage.blend_percentage_max,
                        ),
                        image_b: graph.ImpactImageBatchToImageList({ image: pre }),
                        mode: 'add',
                        blend_percentage: 0.5,
                    })
                    graph.PreviewImage({ images: samples })
                    samples = graph.VAEEncode({ pixels: samples, vae: vae })
                }

                const image = graph.VAEDecode({
                    vae: vae,
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

                for (const bbox_detectorName of p.bbox_detectors) {
                    const bbox_detector = graph.UltralyticsDetectorProvider({ model_name: bbox_detectorName })
                    run_Detailer({
                        flow,
                        image: image,
                        vae,
                        bbox_detector,
                        ckpt: ckpt,
                        clip: clipAndModel,
                        positive: positive_clip,
                        negative: negative_clip,
                        preview: true,
                    })
                }
            }
        } else {
            if (p.wierd) {
                samples = graph.RepeatLatentBatch({
                    samples: latent,
                    amount: p.wierd?.batchSize,
                })
            } else {
                samples = graph.VAEEncode({
                    pixels: blender(
                        p.number,
                        p.total_steps,
                        p.blend_percentage.blend_percentage_min,
                        p.blend_percentage.blend_percentage_max,
                    ),
                    vae: vae,
                })
            }
            const positive_clip = graph.CLIPTextEncode({
                clip: clipAndModel,
                text: `${positive}`,
            })
            const negative_clip = graph.CLIPTextEncode({
                clip: lora_manga ?? clipAndModel,
                text: negative,
            })
            if (p.wierd) {
                const pre = graph.MiDaS$7DepthMapPreprocessor({
                    image: graph.VAEDecode({
                        vae: vae,
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
                    image_a: blender(
                        p.number,
                        p.total_steps,
                        p.blend_percentage.blend_percentage_min,
                        p.blend_percentage.blend_percentage_max,
                    ),
                    image_b: graph.ImpactImageBatchToImageList({ image: pre }),
                    mode: 'add',
                    blend_percentage: 0.5,
                })
                graph.PreviewImage({ images: samples })
                samples = graph.VAEEncode({ pixels: samples, vae: vae })
            }

            const image = graph.VAEDecode({
                vae: vae,
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
            for (const bbox_detectorName of p.bbox_detectors) {
                const bbox_detector = graph.UltralyticsDetectorProvider({ model_name: bbox_detectorName })
                run_Detailer({
                    flow,
                    image: image,
                    vae,
                    bbox_detector,
                    ckpt: ckpt,
                    clip: clipAndModel,
                    positive: positive_clip,
                    negative: negative_clip,
                    preview: true,
                })
            }
            // if (p.extra?.face) {
            //     face = graph.FaceDetailer({
            //         image: graph.ImpactImageBatchToImageList({ image: image }),
            //         model: clipAndModel,
            //         clip: clipAndModel,
            //         vae: vae,
            //         positive: positive_clip,
            //         negative: negative_clip,
            //         bbox_detector: bbox_detector_face,
            //         sam_model_opt: sam_loader,
            //         sampler_name: 'ddim',
            //         scheduler: 'karras',
            //         denoise: p.extra.denoise,
            //         sam_detection_hint: 'none',
            //         sam_mask_hint_use_negative: 'False',
            //         wildcard: '',
            //     }).outputs
            //     graph.PreviewImage({ images: face.image })
            // }
            // if (p.extra?.hands) {
            //     hand = graph.FaceDetailer({
            //         image: face?.image ?? graph.ImpactImageBatchToImageList({ image: image }),
            //         model: clipAndModel,
            //         clip: clipAndModel,
            //         vae: vae,
            //         positive: positive_clip,
            //         negative: negative_clip,
            //         bbox_detector: bbox_detector_hand,
            //         sam_model_opt: sam_loader,
            //         sampler_name: 'ddim',
            //         scheduler: 'karras',
            //         denoise: p.extra.denoise,
            //         sam_detection_hint: 'none',
            //         sam_mask_hint_use_negative: 'False',
            //         wildcard: '',
            //     }).outputs
            //     graph.PreviewImage({ images: hand.image })
        }

        await flow.PROMPT()

        // const im = flow.lastImage
    },
})
