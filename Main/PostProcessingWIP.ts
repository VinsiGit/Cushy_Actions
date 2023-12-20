import Konva from 'konva'

import { condition, filter, mkDomImage, mkImage } from '../_prefabs/_imgEditing'
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
    conf_recursiveImg2Img,
    build_recursiveImg2Img,
    run_saves_was,
    ui_save,
    run_highresfix,
} from '../_prefabs/_prefabs'

app({
    // author: 'VinsiGit',
    // name: 'Normal',
    // description: 'Make a Image',
    ui: (form) => ({
        Image: form.image({}),
        positive: form.prompt({}),
        negative: form.prompt({ default: '(child:1.2, loli:1.2), nsfw, nude' }),
        model: ui_model(form),
        latent: ui_latent(form),
        sampler: ui_sampler(form),

        seed: form.seed({}),
        highResFix: ui_highresfix(form),
        recursiveImgToImg: conf_recursiveImg2Img(form),
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
        // let posit_text = util_expandBrances(`${positive}`)
        // for (const text of posit_text) {
        //     let LATENT: _LATENT = baseLatent
        //     // 1️⃣ FIRST PASS --------------------------------------------------------
        //     let image = run_sampler({
        //         ckpt: ckptPos,
        //         clip: clipPos,
        //         vae,
        //         flow,
        //         latent: LATENT,
        //         model: p.sampler,
        //         positive: text,
        //         negative: negative,
        //         preview: true,
        //         // p.highResFix == null || //
        //         // p.highResFix.saveIntermediaryImage,
        //     })
        //     run_saves_was({ flow, opts: p.save, image: image.image })
        //     LATENT = image.latent
        //     // 2️⃣ recursive image to image --------------------------------------------------------------
        //     if (p.recursiveImgToImg) {
        //         LATENT = build_recursiveImg2Img(flow, p.recursiveImgToImg, {
        //             latent: LATENT,
        //             ckpt: ckptPos,
        //             clip: clipPos,
        //             vae: vae,
        //             positive: '',
        //             negative: '',
        //         })
        //     }
        //     // 3️⃣ upscale latent (a.k.a. highres fix) ---------------------------------------------------------
        //     if (p.highResFix) {
        //         let image = run_highresfix({
        //             flow,
        //             latentInput: LATENT,
        //             ckpt,
        //             clip,
        //             vae,
        //             latent_ui: p.latent,
        //             sampler_ui: p.sampler,
        //             highresfix: p.highResFix,
        //             positive: text,
        //             negative: negative,
        //         })
        //         // let test = (await flow.loadImageSDK()).Konva
        //         // test.Filters.Blur

        //         // let imageTest = new ImageData(p.latent.size.width, p.latent.size.height);
        //         // let test = (await flow.loadImageSDK()).Konva
        //         // let imageTest = new ImageData(p.latent.size.width, p.latent.size.height)
        //         // test.Filters.Blur

        //         // graph.PreviewImage({ images: test })
        //     }
        // }
        let testimg = await (await flow.loadImageAnswer(p.Image))._IMAGE
        graph.PreviewImage({ images: testimg })
        await flow.PROMPT()

        let img = new Image()
        img.src = '/library/CushyStudio/_public/illustrations/image_home_transp.webp'

        const lastImage = flow.lastImage

        let base = await mkDomImage(lastImage?.url ?? '/library/CushyStudio/_public/illustrations/image_home_transp.webp')

        const testFiler = function (imageData: ImageData) {
            let condition = function (x: number, y: number) {
                const centerX = imageData.width / 2 - 2
                const centerY = imageData.height / 2 - 2 // - ((imageData.height / 2) % 2)
                const radius = Math.round(Math.min(imageData.width, imageData.height) / 2)
                return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2
                // return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2
            }
            let condition2 = function (x: number, y: number): { condition: boolean; color: number[] } {
                // Calculate condition and color based on x and y
                let condition = true // replace with actual condition
                let color = [0, 0, 0, 0] // replace with actual color

                const centerX = imageData.width / 2 - 2
                const centerY = imageData.height / 2 - 2
                const radius = Math.round(Math.min(imageData.width, imageData.height) / 2)
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
                const colorInfo = Math.round(255 * (1 - distance / radius)) //(1 - distance / radius)
                color = [colorInfo, colorInfo, colorInfo, 255]
                condition = (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2
                return { condition, color }
            }

            for (let i = 0; i < imageData.data.length; i += 4) {
                let x = (i / 4) % imageData.width
                let y = Math.floor(i / 4 / imageData.width)
                let result = condition2(x, y)

                if (result.condition) {
                    imageData.data[i] += result.color[0]
                    imageData.data[i + 1] += result.color[1]
                    imageData.data[i + 2] += result.color[2]
                    imageData.data[i + 3] = result.color[3]
                }
            }
        }
        let nodetest = new Konva.Image({
            image: base,
            width: base.width,
            height: base.height,
        })

        /**
         * Performs bicubic interpolation on the given image data.
         *
         * @param x The x-coordinate of the pixel.
         * @param y The y-coordinate of the pixel.
         * @param imageData The image data.
         * @param color The color of the pixel.
         * @returns An object with a boolean condition and a color array.
         */
        const condition = (
            x: number,
            y: number,
            imageData: ImageData,
            color: number[],
        ): { condition: boolean; color: number[] } => {
            // Calculate condition and color based on x and y
            let condition = true
            // color = [0, 0, 0, 0]

            // Perform bicubic interpolation
            for (let i = -1; i <= 2; i++) {
                for (let j = -1; j <= 2; j++) {
                    const pixelX = Math.min(Math.max(x + i, 0), imageData.width - 1)
                    const pixelY = Math.min(Math.max(y + j, 0), imageData.height - 1)
                    const pixelIndex = (pixelY * imageData.width + pixelX) * 4

                    for (let k = 0; k < 3; k++) {
                        color[k] += 1
                    }
                }
            }

            return { condition, color }
        }

        /**
         * Performs bicubic interpolation on the given image data.
         *
         * @param x The x-coordinate of the pixel.
         * @param y The y-coordinate of the pixel.
         * @param imageData The image data.
         * @param color The color of the pixel.
         * @returns An object with a boolean condition and a color array.
         */
        function bicubicInterpolation(imageData: ImageData, originalWidth: number, originalHeight: number): void {
            const scaleX = originalWidth / imageData.width
            const scaleY = originalHeight / imageData.height

            for (let x = 0; x < imageData.width; x++) {
                for (let y = 0; y < imageData.height; y++) {
                    const px = Math.floor(x * scaleX)
                    const py = Math.floor(y * scaleY)

                    // Calculate the interpolated color value using the 16 surrounding pixels
                    // This is a simplified version and does not actually perform bicubic interpolation
                    const color = [0, 0, 0, 0]
                    for (let i = -1; i <= 2; i++) {
                        for (let j = -1; j <= 2; j++) {
                            const pixelX = Math.min(Math.max(px + i, 0), originalWidth - 1)
                            const pixelY = Math.min(Math.max(py + j, 0), originalHeight - 1)
                            const pixelIndex = (pixelY * originalWidth + pixelX) * 4
                            for (let k = 0; k < 4; k++) {
                                color[k] += imageData.data[pixelIndex + k] / 16
                            }
                        }
                    }

                    // Assign the interpolated color value to the pixel in the image data
                    const newPixelIndex = (y * imageData.width + x) * 4
                    for (let k = 0; k < 4; k++) {
                        imageData.data[newPixelIndex + k] = color[k]
                    }
                }
            }
        }
        const filter2 = filter(condition)
        graph.PreviewImage({ images: (await flow.load_dataURL(await nodetest.toDataURL()))._IMAGE })

        nodetest.cache()
        nodetest.filters([filter2])
        let imageEdit = (await flow.load_dataURL(await nodetest.toDataURL()))._IMAGE
        graph.PreviewImage({ images: imageEdit })

        let lat = graph.VAEEncode({ pixels: imageEdit, vae: vae })

        await flow.PROMPT()
    },
})
// function uint8ArrayToBase64(pixels: number[][][], mimeType: string): string {
//     let binary = ''
//     const channels = mimeType === 'image/png' ? 4 : 3

//     for (let y = 0; y < pixels.length; y++) {
//         for (let x = 0; x < pixels[y].length; x++) {
//             const pixel = pixels[y][x]
//             for (let i = 0; i < channels; i++) {
//                 let placePixel = pixel[i]
//                 placePixel = placePixel + 20
//                 if (placePixel > 255) {
//                     placePixel = 255
//                 }

//                 binary += String.fromCharCode(placePixel)
//             }
//         }
//     }
//     console.log(binary)

//     const base64 = 'data:' + mimeType + ';base64,' + btoa(binary)
//     return base64
// }
// function uint8ArrayToBase64test(pixels: number[][][], mimeType: string): string {
//     const channels = mimeType === 'image/png' ? 4 : 3
//     const data = new Uint8Array(pixels.length * pixels[0].length * channels)

//     let dataIndex = 0
//     for (let y = 0; y < pixels.length; y++) {
//         for (let x = 0; x < pixels[y].length; x++) {
//             const pixel = pixels[y][x]
//             for (let i = 0; i < channels; i++) {
//                 if (i % 2 != 0) {
//                     let placePixel = pixel[i] + 20
//                     if (placePixel > 255) {
//                         placePixel = 255
//                     }
//                     data[dataIndex++] = placePixel
//                 }
//             }
//         }
//     }

//     let binary = ''
//     for (let i = 0; i < data.byteLength; i++) {
//         binary += String.fromCharCode(data[i])
//     }

//     const base64 = 'data:' + mimeType + ';base64,' + btoa(binary)
//     return base64
// }
