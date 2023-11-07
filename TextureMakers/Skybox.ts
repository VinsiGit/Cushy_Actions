import { run_model, run_prompt, ui_model } from '../_prefabs/_prefabs'

action({
    ui: (form) => ({
        model: ui_model(form),
        positive: form.prompt({}),
        negative: form.prompt({}),
    }),
    run(flow, p) {
        const graph = flow.nodes
        const { ckpt, vae, clip } = run_model(flow, p.model)
        const x = run_prompt(flow, { richPrompt: p.positive, clip, ckpt })
        const y = run_prompt(flow, { richPrompt: p.negative, clip, ckpt })
    },
})
