action({
    author: 'VinsiGit',
    name: 'DepthDrawer',
    description: 'Colors a depth image by ',
    help: '',
    ui: (form) => ({
        model: form.enum({
            enumName: 'Enum_CheckpointLoaderSimple_ckpt_name',
            default: 'Normal\\sudachi_v10.safetensors',
            group: 'Model',
        }),

        width: form.int({ default: 512, group: 'latent' }),
        height: form.int({ default: 768, group: 'latent' }), //normaal 768
        flip: form.bool({ default: false, group: 'latent' }),

        // prompt
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

        denoise1: form.float({ default: 0.6, group: 'denoise' }),
        denoise2: form.float({ default: 0.6, group: 'denoise' }),
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
        batchSize: form.int({ default: 1, min: 1, group: 'latent' }),

        steps: form.int({
            default: 20,
            label: 'Steps',
            min: 0,
            group: 'KSampler',
        }),

        cfg: form.float({
            label: 'CFG',
            default: 8.0,
            group: 'KSampler',
        }),

        sampler: form.enum({
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

    run: async (flow, p) => {
        const graph = flow.nodes
        let height = p.height
        let width = p.width
        if (p.flip) {
            height = p.width
            width = p.height
        }

        const ckpt = graph.CheckpointLoaderSimple({ ckpt_name: p.model })

        const positive = p.positive
        const negative = p.negative

        const positive_clip = graph.CLIPTextEncode({ clip: ckpt, text: positive })
        const negative_clip = graph.CLIPTextEncode({ clip: ckpt, text: negative })

        let latent = graph.EmptyLatentImage({ height: height, width: width, batch_size: p.batchSize })
        let image = graph.VAEDecode({
            vae: ckpt,
            samples: graph.KSampler({
                model: ckpt,
                seed: flow.randomSeed(),
                latent_image: latent,
                sampler_name: 'euler',
                scheduler: 'karras',
                positive: positive_clip,
                negative: negative_clip,
            }),
        }).outputs.IMAGE
        graph.PreviewImage({ images: image })

        const depth = graph.LeReS$7DepthMapPreprocessor({ image: image, boost: 'enable' }).outputs.IMAGE
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
            width: p.width,
            height: p.height,
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
                    width: p.width,
                    height: p.height,
                    red: color,
                    green: color,
                    blue: color,
                })
            } else {
                blank = graph.Image_Blank({
                    width: p.width,
                    height: p.height,
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

        let latent_images = graph.KSampler({
            model: ckpt,
            seed: flow.randomSeed(),
            latent_image: graph.VAEEncode({ pixels: image, vae: ckpt }),
            cfg: p.cfg,
            steps: p.steps,
            sampler_name: p.sampler,
            scheduler: p.scheduler,
            denoise: p.denoise1,
            positive: test.outputs.positive ?? positive_clip,
            negative: test.outputs.negative ?? negative_clip,
        })

        image = graph.VAEDecode({
            vae: ckpt,
            samples: latent_images,
        }).outputs.IMAGE

        graph.PreviewImage({ images: image })

        latent_images = graph.KSampler({
            model: ckpt,
            seed: flow.randomSeed(),
            latent_image: latent_images,
            cfg: p.cfg,
            steps: p.steps,
            sampler_name: p.sampler,
            scheduler: p.scheduler,
            denoise: p.denoise2,
            positive: test.outputs.positive ?? positive_clip,
            negative: test.outputs.negative ?? negative_clip,
        })

        image = graph.VAEDecode({
            vae: ckpt,
            samples: latent_images,
        }).outputs.IMAGE
        graph.PreviewImage({ images: image })

        await flow.PROMPT()
    },
})
