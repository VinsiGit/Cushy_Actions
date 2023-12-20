import type { ImageAndMask, Runtime } from 'src/back/Runtime'
import type { FormBuilder } from 'src/controls/FormBuilder'
import type { ReqResult } from 'src/controls/IWidget'

// this should be a default
export type OutputFor<UIFn extends (form: FormBuilder) => any> = ReqResult<ReturnType<UIFn>>

// everything for making a image

export const mkDomImage = (src: string): Promise<HTMLImageElement> => {
    const image = new Image()
    image.src = src
    return new Promise((yes, no) => {
        image.onload = () => {
            return yes(image)
        }
    })
    // return image
}

export const mkImage = async (p: { flow: Runtime; width: number; height: number }) => {
    const flow = p.flow
    const width = p.width
    const height = p.height
    const I = await flow.loadImageSDK()

    const container: HTMLDivElement = I.createContainer()
    const stage = new I.Stage({ container: container, width, height })
    const layer = new I.Layer()
    stage.add(layer)

    return { container, stage, layer }
}

export async function _drawImg(
    //
    flow: Runtime,
    opts: {
        baseUrl: string
        W: number
        H: number
    },
): Promise<{
    base: ImageAndMask
    mask: ImageAndMask
}> {
    const I = await flow.loadImageSDK()
    const { W, H } = opts
    const mkImage = () => {
        const container: HTMLDivElement = I.createContainer()
        const stage = new I.Stage({ container: container, width: W, height: H })
        const layer = new I.Layer()
        stage.add(layer)
        return { container, stage, layer }
    }

    const mkDomImage = (src: string): Promise<HTMLImageElement> => {
        const image = new Image()
        image.src = src
        return new Promise((yes, no) => {
            image.onload = () => {
                return yes(image)
            }
        })
        // return image
    }

    // transparent base image
    const base = mkImage()

    if (opts.baseUrl) {
        const image = await mkDomImage(opts.baseUrl)
        base.layer.add(new I.Image({ image /*x: 0, y: 0, width: W, height: H*/ }))
    }
    // white mask
    const mask = mkImage()
    mask.layer.add(new I.Rect({ x: 0, y: 0, width: W, height: H, fill: 'transparent' }))

    // export the base
    base.stage.draw()
    const dataURL_base = base.stage.toDataURL({ width: W, height: H })

    // export the mask
    mask.stage.draw()
    const dataURL_mask = mask.stage.toDataURL({ width: W, height: H })
    return {
        base: await flow.load_dataURL(dataURL_base),
        mask: await flow.load_dataURL(dataURL_mask),
    }
}
export const condition = (x: number, y: number, imageData: ImageData): { condition: boolean; color: number[] } => {
    // Calculate condition and color based on x and y
    let condition = true // replace with actual condition
    let color = [0, 0, 0, 0] // replace with actual color [r,g,b,a]

    const centerX = imageData.width / 2 - 2
    const centerY = imageData.height / 2 - 2
    const radius = Math.round(Math.min(imageData.width, imageData.height) / 2)
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
    const colorInfo = Math.round(255 * (1 - distance / radius)) //(1 - distance / radius)
    color = [colorInfo, colorInfo, colorInfo, 255]
    condition = (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2
    return { condition, color }
}

/**
 * The `filter` function is a higher-order function that takes a `condition` function as an argument.
 * This `condition` function should take three arguments: two numbers (`x` and `y`), and an `ImageData` object.
 * It should return an object with a `condition` property (a boolean) and a `color` property (an array of four numbers) `[r,g,b,a]`.
 *
 * @param condition A function that takes the x and y coordinates of a pixel and the image data, and returns an object with a boolean condition and a color array.
 * @returns A function that takes an ImageData object, applies the `condition` function to each pixel, and modifies the pixel's color based on the result.
 */
export const filter = (
    condition: (x: number, y: number, imageData: ImageData, color: number[]) => { condition: boolean; color: number[] },
) => {
    return (imageData: ImageData) => {
        for (let i = 0; i < imageData.data.length; i += 4) {
            let color = [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2], imageData.data[i + 3]]
            let x = (i / 4) % imageData.width
            let y = Math.floor(i / 4 / imageData.width)
            let result = condition(x, y, imageData, color)

            if (result.condition) {
                imageData.data[i] = result.color[0]
                imageData.data[i + 1] = result.color[1]
                imageData.data[i + 2] = result.color[2]
                imageData.data[i + 3] = result.color[3]
            }
        }
    }
}
export const filterBackup = (imageData: ImageData) => {
    for (let i = 0; i < imageData.data.length; i += 4) {
        let x = (i / 4) % imageData.width
        let y = Math.floor(i / 4 / imageData.width)
        let result = condition(x, y, imageData)

        if (result.condition) {
            imageData.data[i] += result.color[0]
            imageData.data[i + 1] += result.color[1]
            imageData.data[i + 2] += result.color[2]
            imageData.data[i + 3] = result.color[3]
        }
    }
}
