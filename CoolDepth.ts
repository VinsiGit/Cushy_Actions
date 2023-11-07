import { run_latent, run_model, run_sampler, ui_latent, ui_model, ui_sampler } from './_prefabs/_prefabs'

action({
    // author: 'VinsiGit',
    // name: 'DepthDrawer',
    // description: 'Colors a depth image by ',
    help: '',
    ui: (form) => {
        return {
            // bar: form.choices({ items: () => ({ a1: $.handform(), a2: $.handform() }) }),
            // faceDetailer: $.faceDetailer(),

            model: ui_model(form),
            latent: ui_latent(form),
            positive: form.string({ default: '' }),
            negative: form.string({ default: '' }),

            number: form.int({
                default: 15,
                group: 'color',
                tooltip: 'How many pixels (of 255) it will move per loop, until reaching pixel 255',
            }),
            variance: form.int({
                default: 15,
                group: 'color',
                tooltip: 'How many pixels up and down it will take give a color',
            }),

            gray: form.boolean({ default: false }),
            color: form.group({
                tooltip: 'Color range of the new image',
                layout: 'V',
                items: () => ({
                    red_max: form.int({ default: 255, min: 0, max: 255 }),
                    red_min: form.int({ default: 0, min: 0, max: 255 }),
                    green_max: form.int({ default: 255, min: 0, max: 255 }),
                    green_min: form.int({ default: 0, min: 0, max: 255 }),
                    blue_max: form.int({ default: 255, min: 0, max: 255 }),
                    blue_min: form.int({ default: 0, min: 0, max: 255 }),
                }),
            }),
            colorLast: form.group({
                tooltip: 'Color of that will replace the white void',
                layout: 'V',
                items: () => ({
                    red: form.int({ default: 0, min: 0, max: 255 }),
                    green: form.int({ default: 0, min: 0, max: 255 }),
                    blue: form.int({ default: 0, min: 0, max: 255 }),
                }),
            }),
            sampler: form.group({
                items: () => ({
                    denoise: form.float({ step: 0.01, min: 0, max: 1, default: 0.6, label: 'Denoise', group: 'KSampler' }),
                    steps: form.int({ default: 20, label: 'Steps', min: 0, group: 'KSampler' }),
                    cfg: form.float({ label: 'CFG', default: 8.0, group: 'KSampler' }),
                    sampler_name: form.enum({
                        label: 'Sampler',
                        enumName: 'Enum_KSampler_sampler_name',
                        default: 'euler',
                        group: 'KSampler',
                    }),
                    scheduler: form.enum({
                        label: 'Scheduler',
                        enumName: 'Enum_KSampler_scheduler',
                        default: 'karras',
                        group: 'KSampler',
                    }),
                }),
            }),
            sampler2: form.group({
                items: () => ({
                    denoise: form.float({ step: 0.01, min: 0, max: 1, default: 0.6, label: 'Denoise', group: 'KSampler' }),
                    steps: form.int({ default: 20, label: 'Steps', min: 0, group: 'KSampler' }),
                    cfg: form.float({ label: 'CFG', default: 8.0, group: 'KSampler' }),
                    sampler_name: form.enum({
                        label: 'Sampler',
                        enumName: 'Enum_KSampler_sampler_name',
                        default: 'euler',
                        group: 'KSampler',
                    }),
                    scheduler: form.enum({
                        label: 'Scheduler',
                        enumName: 'Enum_KSampler_scheduler',
                        default: 'karras',
                        group: 'KSampler',
                    }),
                }),
            }),
        }
    },

    run: async (flow, p) => {
        const graph = flow.nodes

        // const controlnet = graph.ControlNetLoader({ control_net_name: 'control_v11p_sd15_openpose_fp16.safetensors' })
        // const bbox_detector = graph.UltralyticsDetectorProvider({ model_name: 'bbox/face_yolov8m.pt' })
        // const SAMLoader = graph.SAMLoader({ model_name: 'sam_vit_b_01ec64.pth', device_mode: 'AUTO' })

        let { ckpt, vae, clip } = run_model(flow, p.model)

        const positive = p.positive
        const negative = p.negative

        const positive_clip = graph.CLIPTextEncode({ clip, text: positive })
        const negative_clip = graph.CLIPTextEncode({ clip, text: negative })
        let latent = await run_latent({ flow, opts: p.latent, vae })

        // let image = graph.VAEDecode({
        //     vae,
        //     samples: graph.KSampler({
        //         model: ckpt,
        //         seed: flow.randomSeed(),
        //         latent,
        //         sampler_name: 'euler',
        //         scheduler: 'karras',
        //         positive: positive_clip,
        //         negative: negative_clip,
        //     }),
        // }).outputs.IMAGE

        let image: _IMAGE = run_sampler({
            flow,
            ckpt,
            clip,
            latent: latent.latent,
            positive: positive,
            negative: negative,
            model: p.sampler2,
            preview: true,
            vae,
        }).image

        const depth = graph.LeReS$7DepthMapPreprocessor({ image: image, boost: 'enable' }).outputs.IMAGE

        graph.PreviewImage({ images: depth })

        let color_number = 255

        let color_red_number_max = p.color.red_max
        let color_red_number_min = p.color.red_min
        let color_green_number_max = p.color.green_max
        let color_green_number_min = p.color.green_min
        let color_blue_number_max = p.color.blue_max
        let color_blue_number_min = p.color.blue_min

        const number = p.number
        const variance = p.variance
        const rgb = 255

        let blank
        let redo = graph.Image_Blank({
            width: latent.width,
            height: latent.height,
            red: rgb,
            green: rgb,
            blue: rgb,
        }).outputs.IMAGE

        do {
            let select = graph.Image_Select_Color({
                image: depth,
                blue: color_number,
                green: color_number,
                red: color_number,
                variance: variance,
            })
            if (p.gray == true) {
                let color = Math.floor(Math.random() * rgb)
                blank = graph.Image_Blank({
                    width: latent.width,
                    height: latent.height,
                    red: color,
                    green: color,
                    blue: color,
                })
            } else {
                blank = graph.Image_Blank({
                    width: latent.width,
                    height: latent.height,
                    red: Math.floor(Math.random() * (color_red_number_max - color_red_number_min)) + color_red_number_min,
                    green: Math.floor(Math.random() * (color_green_number_max - color_green_number_min)) + color_green_number_min,
                    blue: Math.floor(Math.random() * (color_blue_number_max - color_blue_number_min)) + color_blue_number_min,
                })
            }

            let bland = graph.ImageBlend({
                image1: select,
                image2: blank,
                blend_mode: 'multiply',
                blend_factor: 1,
            })

            let remove = graph.Image_Remove_Color({
                image: bland,
                target_red: 0,
                target_green: 0,
                target_blue: 0,
            })
            let bland2 = graph.ImageBlend({
                image1: remove,
                image2: redo,
                blend_mode: 'multiply',
                blend_factor: 1,
            }).outputs.IMAGE
            redo = bland2
            graph.PreviewImage({ images: redo })
            color_number = color_number - number
            console.log(color_number)
        } while (color_number > 0)

        image = graph.Image_Remove_Color({
            image: redo,
            target_red: 255,
            target_green: 255,
            target_blue: 255,
            replace_red: p.colorLast.red,
            replace_green: p.colorLast.green,
            replace_blue: p.colorLast.blue,
        }).outputs.IMAGE
        graph.PreviewImage({ images: image })

        const controlenet = graph.ControlNetLoader({ control_net_name: 'control_v11f1p_sd15_depth_fp16.safetensors' })

        const test = graph.ControlNetApplyAdvanced({
            control_net: controlenet,
            image: image,
            strength: 0.9,
            negative: negative_clip,
            positive: positive_clip,
        })
        let latent_images = run_sampler({
            flow,
            ckpt,
            clip,
            latent: latent.latent,
            positive: test.outputs.positive ?? positive_clip,
            negative: test.outputs.negative ?? negative_clip,
            model: p.sampler,
            preview: true,
            vae,
        })
        // latent_images = graph.KSampler({
        //     model: ckpt,
        //     seed: flow.randomSeed(),
        //     latent_image: graph.VAEEncode({ pixels: image, vae }),
        //     cfg: p.cfg,
        //     steps: p.steps,
        //     sampler_name: p.sampler1,
        //     scheduler: p.scheduler,
        //     denoise: p.denoise1,
        //     positive: test.outputs.positive ?? positive_clip,
        //     negative: test.outputs.negative ?? negative_clip,
        // })

        graph.PreviewImage({ images: image })

        latent_images = run_sampler({
            flow,
            ckpt,
            clip,
            latent: latent_images.latent,
            positive: positive,
            negative: negative,
            model: p.sampler2,
            preview: true,
            vae,
        })
        graph.PreviewImage({ images: image })

        await flow.PROMPT()
    },
})
