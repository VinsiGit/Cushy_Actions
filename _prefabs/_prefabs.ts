/**
 * This file contains all the prefabs that are used in the default card.
 *
 * naming convention:
 *
 * - `ui`  functions are prefixed with `ui_`
 * - `run` functions are prefixed with `run_`
 *
 * make sure you only impot types from this file
 * 🟢 import type {...} from '...'
 * ❌ import {...} from '...'`
 * */
import type { Runtime } from 'src/back/Runtime'
import type { FormBuilder } from 'src/controls/FormBuilder'
import type { ReqResult } from 'src/controls/IWidget'
import type { ComfyNodeOutput } from 'src/core/Slot'
import type { WidgetPromptOutput } from 'src/widgets/prompter/WidgetPromptUI'

// this should be a default
export type OutputFor<UIFn extends (form: FormBuilder) => any> = ReqResult<ReturnType<UIFn>>

// const form = getGlobalFormBuilder()
// const flow = getGlobalRuntime()

// REC IMG 2 IMG ----------------------------------------------------------

export const conf_recursiveImg2Img = (form: FormBuilder) =>
    form.groupOpt({
        items: () => ({
            steps: form.int({ default: 5 }),
            denoise: form.float({ min: 0, max: 1, step: 0.01, default: 0.3 }),
            previewEveryStep: form.bool({ default: true }),
        }),
    })

export const build_recursiveImg2Img = (
    //
    flow: Runtime,
    opts: OutputFor<typeof conf_recursiveImg2Img>,
    ctx: {
        /** default to 8  */
        cfg?: number
        latent: _LATENT
        ckpt: _MODEL
        clip: _CLIP
        vae: _VAE
        positive: string | _CONDITIONING
        negative: string | _CONDITIONING
    },
): _LATENT => {
    let latent = ctx.latent
    for (let i = 0; i < opts!.steps; i++) {
        latent = run_sampler({
            ckpt: ctx.ckpt,
            clip: ctx.clip,
            vae: ctx.vae,
            flow,
            latent,
            model: {
                // reuse model stuff
                cfg: ctx.cfg ?? 8,
                sampler_name: 'ddim',
                scheduler: 'ddim_uniform',
                // override the snd pass specific stuff
                denoise: opts!.denoise,
                steps: 10,
            },
            positive: ctx.positive,
            negative: ctx.negative,
            preview: opts?.previewEveryStep,
        }).latent
    }
    return latent
}

// HIGH_RES_FIX -----------------------------------------------------------
export const ui_highresfix = (form: FormBuilder) =>
    form.groupOpt({
        items: () => ({
            scaleFactor: form.float({ min: 0, max: 3, step: 0.1, default: 2 }),
            steps: form.int({ min: 1, default: 10 }),
            denoise: form.float({ min: 0, default: 0.6, max: 1, step: 0.05 }),
            saveIntermediaryImage: form.bool({ default: false }),
            upscale_method: form.enum({ enumName: 'Enum_LatentUpscale_upscale_method', default: 'bicubic' }),
        }),
    })

export const run_highresfix = (p: {
    //
    flow: Runtime
    latentInput: _LATENT
    latent_ui: OutputFor<typeof ui_latent>
    sampler_ui: OutputFor<typeof ui_sampler>
    highresfix: OutputFor<typeof ui_highresfix>
    ckpt: _MODEL
    clip: _CLIP
    vae: _VAE
    positive: string | _CONDITIONING
    negative: string | _CONDITIONING
    preview?: boolean
}) => {
    const graph = p.flow.nodes
    const latentInput = p.latentInput
    const latent = p.latent_ui
    const sampler = p.sampler_ui
    const highresfix = p.highresfix
    const positive = p.positive
    const negative = p.negative
    const ckpt = p.ckpt
    const clip = p.clip
    const vae = p.vae
    const preview = p.preview ?? true

    if (highresfix?.saveIntermediaryImage) {
        graph.PreviewImage({ images: graph.VAEDecode({ vae, samples: latentInput }) })
    }
    const latentscale = graph.LatentUpscale({
        samples: latentInput,
        crop: 'disabled',
        upscale_method: highresfix?.upscale_method ?? 'area',
        height: latent.size.height * (highresfix?.scaleFactor ?? 1),
        width: latent.size.width * (highresfix?.scaleFactor ?? 1),
    }).outputs.LATENT
    return run_sampler({
        flow: p.flow,
        ckpt,
        clip,
        vae,
        latent: latentscale,
        model: {
            // reuse model stuff
            cfg: sampler.cfg,
            sampler_name: 'ddim',
            scheduler: 'ddim_uniform',
            // override the snd pass specific stuff
            denoise: highresfix?.denoise ?? 0.6,
            steps: highresfix?.steps ?? 10,
        },
        positive: positive,
        negative: negative,
        preview,
    })
}

// MODEL PREFAB -----------------------------------------------------------
export const ui_model = (form: FormBuilder) => {
    return form.group({
        items: () => ({
            ckpt_name: form.enum({
                enumName: 'Enum_CheckpointLoaderSimple_ckpt_name',
                default: 'Normal\\Anime\\sudachi_v10.safetensors',
                group: 'Model',
            }),
            vae: form.enumOpt({ enumName: 'Enum_VAELoader_vae_name', group: 'Model' }),
            clipSkip: form.int({ label: 'Clip Skip', default: 0, max: 10, group: 'Model' }),
            freeU: form.bool({ default: false, group: 'Model' }),
        }),
    })
}

export const run_model = (flow: Runtime, p: OutputFor<typeof ui_model>) => {
    const graph = flow.nodes

    // 1. MODEL
    const ckptSimple = graph.CheckpointLoaderSimple({ ckpt_name: p.ckpt_name })
    let ckpt: HasSingle_MODEL = ckptSimple
    let clip: HasSingle_CLIP = ckptSimple

    // 2. OPTIONAL CUSTOM VAE
    let vae: _VAE = ckptSimple._VAE
    if (p.vae) vae = graph.VAELoader({ vae_name: p.vae })

    // 3. OPTIONAL CLIP SKIP
    if (p.clipSkip) clip = graph.CLIPSetLastLayer({ clip, stop_at_clip_layer: -Math.abs(p.clipSkip) })

    // 4. Optional FreeU
    if (p.freeU) ckpt = graph.FreeU({ model: ckpt })

    return { ckpt, vae, clip }
}

// -----------------------------------------------------------
export const ui_sampler = (form: FormBuilder) => {
    return form.group({
        items: () => ({
            denoise: form.float({ step: 0.01, min: 0, max: 1, default: 1, label: 'Denoise', group: 'KSampler' }),
            steps: form.int({ default: 20, label: 'Steps', min: 0, group: 'KSampler' }),
            cfg: form.float({ label: 'CFG', default: 8.0, max: 20, group: 'KSampler' }),
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
    })
}

export const run_sampler = (p: {
    //
    flow: Runtime
    ckpt: _MODEL
    clip: _CLIP
    latent: _LATENT
    positive: string | _CONDITIONING
    negative: string | _CONDITIONING
    model: OutputFor<typeof ui_sampler>
    vae: _VAE
    preview?: boolean
    seed?: number
}): { image: _IMAGE; latent: HasSingle_LATENT } => {
    const graph = p.flow.nodes
    const latent: HasSingle_LATENT = graph.KSampler({
        model: p.ckpt,
        seed: p.seed ?? p.flow.randomSeed(),
        latent_image: p.latent,
        cfg: p.model.cfg,
        steps: p.model.steps,
        sampler_name: p.model.sampler_name,
        scheduler: p.model.scheduler,
        denoise: p.model.denoise,
        positive: typeof p.positive === 'string' ? graph.CLIPTextEncode({ clip: p.clip, text: p.positive }) : p.positive,
        negative: typeof p.negative === 'string' ? graph.CLIPTextEncode({ clip: p.clip, text: p.negative }) : p.negative,
    })
    const image = graph.VAEDecode({
        vae: p.vae,
        samples: latent,
    })
    if (p.preview) {
        graph.PreviewImage({ images: image })
    }
    return { image, latent }
}
// ---------------------------------------------------------
export const run_Detailer = (p: {
    //
    flow: Runtime
    image: _IMAGE
    ckpt: _MODEL
    clip: _CLIP
    positive: string | _CONDITIONING
    negative: string | _CONDITIONING
    preview?: boolean
    vae: _VAE
    bbox_detector: _BBOX_DETECTOR
    SAM?: SAMLoader
    guide?: boolean
    denoise?: number
    wildcard?: string
}): { image: _IMAGE } => {
    const graph = p.flow.nodes
    const image = graph.FaceDetailer({
        image: p.image,
        bbox_detector: p.bbox_detector,
        sam_model_opt: p.SAM,
        model: p.ckpt,
        clip: p.clip,
        vae: p.vae,
        sampler_name: 'ddim',
        scheduler: 'karras',
        positive: typeof p.positive === 'string' ? graph.CLIPTextEncode({ clip: p.clip, text: p.positive }) : p.positive,
        negative: typeof p.negative === 'string' ? graph.CLIPTextEncode({ clip: p.clip, text: p.negative }) : p.negative,
        sam_detection_hint: 'center-1',
        sam_mask_hint_use_negative: 'False',
        guide_size_for: p.guide ?? true,
        denoise: p.denoise ?? 0.5,
        wildcard: p.wildcard ?? '',
    }).outputs.image
    if (p.preview) graph.PreviewImage({ images: image })

    return { image }
}
// ---------------------------------------------------------
export const ui_themes = (form: FormBuilder) =>
    form.list({
        element: () =>
            form.group({
                layout: 'H',
                items: () => ({
                    text: form.str({ label: 'Main', textarea: true }), //textarea: true
                    theme: form.list({
                        element: () =>
                            form.group({
                                layout: 'V',
                                items: () => ({
                                    text: form.str({ label: 'Theme', textarea: true }), //textarea: true
                                }),
                            }),
                    }),
                }),
            }),
    })

//-----------------------------------------------------------
// UI PART
export const ui_latent = (form: FormBuilder) => {
    return form.group({
        items: () => ({
            image: form.groupOpt({
                items: () => ({
                    image: form.image({ group: 'latent' }),
                    resize: form.bool({ default: false, group: 'latent' }),
                }),
            }),
            size: form.size({ group: 'latent', step: 128, min: 0, max: 2048 }),
            // flip: form.bool({ default: false, group: 'latent' }),
            // size: form.group({
            //     items: () => ({
            //         width: form.int({ default: 512, step: 128, min: 0, max: 2048 }),
            //         height: form.int({ default: 512, step: 128, min: 0, max: 2048 }),
            //     }),
            // }),
            batchSize: form.int({ default: 1, group: 'latent', min: 1, max: 20 }),
        }),
    })
}
export const ui_latent_Image = (form: FormBuilder) => {
    return form.group({
        items: () => ({
            image: form.image({ group: 'latent' }),
            resize: form.bool({ default: false, group: 'latent' }),
            flip: form.bool({ default: false, group: 'latent' }),
            size: form.size({ group: 'latent', step: 128, min: 0, max: 2048 }),
            batchSize: form.int({ default: 1, group: 'latent', min: 1, max: 20 }),
        }),
    })
}
// RUN PART
export const run_latent = async (p: {
    //
    flow: Runtime
    opts: OutputFor<typeof ui_latent>
    vae: _VAE
}) => {
    // init stuff
    const graph = p.flow.nodes
    const opts = p.opts

    // misc calculatiosn
    let width: number | ComfyNodeOutput<'INT'>
    let height: number | ComfyNodeOutput<'INT'>
    let latent: HasSingle_LATENT

    // case 1. start form image
    if (opts.image) {
        let image = await (await p.flow.loadImageAnswer(opts.image.image))._IMAGE
        if (opts.image.resize) {
            image = graph.ImageScale({
                image: image,
                crop: 'disabled',
                upscale_method: 'bicubic',
                height: opts.size.height,
                width: opts.size.width,
            }).outputs.IMAGE
            width = opts.size.width
            height = opts.size.height
        } else {
            const size = graph.Image_Size_to_Number({ image: image })
            width = size.outputs.width_int
            height = size.outputs.height_int
            // p.flow.print(`width: ${width} height: ${height}`)
        }
        latent = graph.VAEEncode({
            pixels: image,
            vae: p.vae,
        })
    }
    // case 2. start form empty latent
    else {
        width = opts.size.width
        height = opts.size.height
        latent = graph.EmptyLatentImage({
            batch_size: opts.batchSize ?? 1,
            height: height,
            width: width,
        })
    }

    // return everything
    return { latent, width, height }
}

// --------------------------------------------------------
export const util_expandBrances = (str: string): string[] => {
    const expandedBraces = util_expandBrance(str)
    return expandedBraces.map(expandBrackets)
}
export const util_expandBrance = (str: string): string[] => {
    const prompts = str.split('|').map((item) => item.trim())
    const combinations: string[] = []
    for (let i = 0; i < prompts.length; i++) {
        let combination = prompts[0]
        for (let j = 1; j <= i; j++) {
            combination += ', ' + prompts[j]
        }
        combinations.push(combination)
    }
    const result: Set<string> = new Set()
    combinations.forEach((combination) => {
        const matches = combination.match(/(?<!\\\/){([^{}]+)}/)
        if (!matches) {
            result.add(combination)
        } else {
            const parts = matches[1].split(',')
            for (const part of parts) {
                const expanded = util_expandBrance(combination.replace(matches[0], part))
                expanded.forEach((item) => result.add(item))
            }
        }
    })
    return Array.from(result)
}
function expandBrackets(input: string): string {
    return input.replace(/(, )?\s*([^,\[]+)\s*\[([^\]]+)\]\s*(, )?/g, function (_, leadingComma, prefix, content, trailingComma) {
        leadingComma = leadingComma || ''
        trailingComma = trailingComma || ''
        return (
            leadingComma +
            content
                .split(',')
                .map((s: string) => `${prefix.trim()} ${s.trim()}`)
                .join(', ') +
            trailingComma
        )
    })
}

export const util_expandBrancesBackup = (str: string): string[] => {
    const matches = str.match(/(?<!\/){([^{}]+)}/)
    if (!matches) {
        return [str]
    }
    const parts = matches[1].split(',')
    const result: Set<string> = new Set()
    for (const part of parts) {
        const expanded = util_expandBrances(str.replace(matches[0], part))
        expanded.forEach((item) => result.add(item))
    }
    return Array.from(result)
}
// --------------------------------------------------------
export const run_prompt = (
    flow: Runtime,
    p: {
        richPrompt: WidgetPromptOutput
        clip: _CLIP
        ckpt: _MODEL
    },
): {
    text: string
    clip: _CLIP
    ckpt: _MODEL
    // conditionning: _CONDITIONING
} => {
    let text = ''
    const richPrompt = p.richPrompt
    let clip = p.clip
    let ckpt = p.ckpt
    if (richPrompt) {
        for (const tok of richPrompt.tokens) {
            if (tok.type === 'booru') text += ` ${tok.tag.text}`
            else if (tok.type === 'text') text += ` ${tok.text}`
            else if (tok.type === 'embedding') text += ` embedding:${tok.embeddingName}`
            else if (tok.type === 'wildcard') {
                const options = (flow.wildcards as any)[tok.payload]
                if (Array.isArray(options)) text += ` ${options[Math.floor(Math.random() * options.length)]}`
            } else if (tok.type === 'lora') {
                const next = flow.nodes.LoraLoader({
                    model: ckpt,
                    clip: clip,
                    lora_name: tok.loraDef.name,
                    strength_clip: tok.loraDef.strength_clip,
                    strength_model: tok.loraDef.strength_model,
                })
                clip = next._CLIP
                ckpt = next._MODEL
            }
        }
    }
    // const conditionning = flow.nodes.CLIPTextEncode({ clip, text })
    return { text, /*conditionning,*/ clip, ckpt }
}

export const ui_vaeName = (form: FormBuilder) =>
    form.enumOpt({
        label: 'VAE',
        enumName: 'Enum_VAELoader_vae_name',
    })

export const ui_modelName = (form: FormBuilder) =>
    form.enum({
        label: 'Checkpoint',
        enumName: 'Enum_CheckpointLoaderSimple_ckpt_name',
    })

export const ui_resolutionPicker = (form: FormBuilder) =>
    form.selectOne({
        label: 'Resolution',
        choices: [
            { id: '1024x1024' },
            { id: '896x1152' },
            { id: '832x1216' },
            { id: '768x1344' },
            { id: '640x1536' },
            { id: '1152x862' },
            { id: '1216x832' },
            { id: '1344x768' },
            { id: '1536x640' },
        ],
        tooltip: 'Width x Height',
    })

/** allow to easilly pick a shape */
export const ui_shapePickerBasic = (form: FormBuilder) => {
    return form.selectOne({
        label: 'Shape',
        choices: [{ id: 'round' }, { id: 'square' }],
    })
}

/** allow to easilly pick any shape given as parameter */
export const ui_shapePickerExt = <const T extends string>(form: FormBuilder, values: T[]) => {
    return form.selectOne({
        label: 'Shape',
        choices: values.map((t) => ({ id: t })),
    })
}

export const ui_tile = (form: FormBuilder) => {
    return form.groupOpt({
        default: true,
        items: () => ({
            tileH: form.int({ min: 0, max: 10, default: 2 }),
            tileV: form.int({ min: 0, max: 10, default: 2 }),
        }),
    })
}

export const run_tile = (p: {
    //
    flow: Runtime
    opts: OutputFor<typeof ui_tile>
    width: number
    height: number
    image: _IMAGE
}): _IMAGE => {
    const graph = p.flow.nodes
    const opts = p.opts
    const width = p.width
    const height = p.height
    const image = p.image
    // misc calculatiosn

    if (opts) {
        const tileH = opts.tileH
        const tileV = opts.tileV
        let BigImage: _IMAGE = graph.Image_Resize({
            image,
            mode: 'resize',
            resampling: 'bicubic',
            supersample: 'false',
            resize_width: width * tileH,
            resize_height: height * tileV,
        }).outputs.IMAGE
        for (let i = 0; i < tileH; i++) {
            for (let j = 0; j < tileV; j++) {
                BigImage = graph.Image_Transpose({
                    image: BigImage,
                    image_overlay: image,
                    width,
                    height,
                    X: width * i,
                    Y: height * j,
                }).outputs.IMAGE
                // graph.PreviewImage({ images: imageNeo })
            }
        }
        graph.PreviewImage({ images: BigImage })
        return BigImage
    }
    return image
}

// save with WAS

export const ui_save = (form: FormBuilder, default_ui?: boolean) => {
    return form.groupOpt({
        default: default_ui ?? false,
        items: () => ({
            embed_workflow: form.boolean({ default: false }),
            extension: form.enum({ enumName: 'Enum_Image_Save_extension', default: 'webp' }),
            filename: form.string({ default: 'comfy' }),
            outputPath: form.stringOpt({ default: '', tooltip: 'folder path from drive where comfyui is localed' }),
            outputPathDate: form.boolean({ default: true }),
            filename_number_start: form.boolean({ default: false }),
            filename_delimiter: form.string({ default: '_' }),
            filename_number_padding: form.int({ default: 4, step: 1, min: 1, max: 9 }),
            quality: form.int({ default: 80, step: 1, min: 1, max: 100 }),
            lossless_webp: form.boolean({ default: false }),
            overwrite_mode: form.boolean({ default: false }),
        }),
    })
}

export const run_saves_was = (p: {
    //
    flow: Runtime
    opts: OutputFor<typeof ui_save>
    image: _IMAGE
}) => {
    const graph = p.flow.nodes
    const opts = p.opts
    const image = p.image
    // misc calculatiosn

    if (opts) {
        const output_path =
            (opts.outputPath ?? '') +
            (opts.outputPathDate //
                ? '/' + new Date().toISOString().slice(0, 10)
                : '')
        graph.Image_Save({
            images: image,
            embed_workflow: !opts.embed_workflow ? 'false' : 'true',
            extension: opts.extension,
            filename_number_start: !opts.filename_number_start ? 'false' : 'true',
            show_previews: 'false',
            filename_delimiter: opts.filename_delimiter,
            filename_number_padding: opts.filename_number_padding,
            filename_prefix: opts.filename,
            output_path,
            quality: opts.quality,
            lossless_webp: !opts.lossless_webp ? 'false' : 'true',
            overwrite_mode: opts.overwrite_mode ? 'prefix_as_filename' : 'false',
            show_history: 'false',
            show_history_by_prefix: 'false',
        })
        // p.flow.print(output_path)
    }
}

// --------------------------------------------------------
export const ui_preprocessor = (form: FormBuilder, default_ui?: 'Lineart' | 'OpenPose' | 'Depth' | 'Normal' | undefined) => {
    return form.choice({
        label: 'preprocessor',
        tooltip: 'preprocessor being used on Image',
        default: default_ui ?? 'OpenPose',
        items: () => {
            return {
                OpenPose: form.selectOne({
                    choices: [
                        { id: 'OpenPose', label: 'OpenPose' },
                        { id: 'DWPose', label: 'SpecialPose' },
                    ],
                }),
                Depth: form.selectOne({
                    choices: [
                        { id: 'DepthMiDaS', label: 'MiDaS' },
                        { id: 'DepthZoe', label: 'Zoe' },
                    ],
                }),

                Normal: form.selectOne({
                    choices: [
                        { id: 'NormalMiDaS', label: 'MiDaS' },
                        { id: 'NormalBAE', label: 'BAE' },
                    ],
                }),
                Lineart: form.selectOne({
                    choices: [
                        { id: 'LineartReal', label: 'Real' },
                        { id: 'LineartAnime', label: 'Anime' },
                        { id: 'LineartManga', label: 'Manga' },
                    ],
                }),
            }
        },
    })
}

export const run_preprocessor = (p: {
    //
    flow: Runtime
    image: _IMAGE
    preprocessor: OutputFor<typeof ui_preprocessor>
    preview?: boolean
}): _IMAGE => {
    const graph = p.flow.nodes
    const preprocessor = p.preprocessor
    const image = p.image
    const preview = p.preview ?? true
    let preprocessorImage: _IMAGE | undefined
    switch (preprocessor.id) {
        case 'OpenPose':
            preprocessorImage = graph.OpenposePreprocessor({ image: image })
            break
        case 'DWPose':
            preprocessorImage = graph.DWPreprocessor({ image: image })
            break
        case 'DepthMiDaS':
            preprocessorImage = graph.MiDaS$7DepthMapPreprocessor({ image: image })
            break
        case 'DepthZoe':
            preprocessorImage = graph.Zoe$7DepthMapPreprocessor({ image: image })
            break
        case 'NormalMiDaS':
            preprocessorImage = graph.MiDaS$7NormalMapPreprocessor({ image: image })
            break
        case 'NormalBAE':
            preprocessorImage = graph.BAE$7NormalMapPreprocessor({ image: image })
            break
        case 'LineartReal':
            preprocessorImage = graph.LineArtPreprocessor({ image: image })
            break
        case 'LineartAnime':
            preprocessorImage = graph.AnimeLineArtPreprocessor({ image: image })
            break
        case 'LineartManga':
            preprocessorImage = graph.Manga2Anime$_LineArt$_Preprocessor({ image: image })
            break
        default:
            p.flow.output_text('no preprocessor selected')
            break
    }
    if (preview) graph.PreviewImage({ images: preprocessorImage ?? image })
    return preprocessorImage ?? image
}
