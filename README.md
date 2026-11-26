# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Publicação em produção (Vercel)

- **A produção é sempre a branch `main`.** Todo push na `main` gera um deploy de produção automático.
- Por isso, **nada pode ficar só em uma branch de feature**: se o layout ou uma tela estiver publicado a partir de outra branch (deploy manual ou promoção), o próximo push na `main` o substitui pela versão antiga.
- Antes de qualquer push na `main`, confira se ela já contém tudo o que está em produção: `git log main..origin/<branch-em-producao>` deve estar vazio.
- Para publicar uma feature: faça o merge na `main` (com o layout verde atual) e valide o build com `npm run build`.
- Em caso de problema, volte a produção pelo painel do Vercel (Rollback) para o deploy anterior e depois corrija na `main`.
