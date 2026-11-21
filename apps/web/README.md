## ChatMD для учебных материалов

Компонент `ChatMD` из `src/components/chatmd/ChatMD.tsx` принимает строку `source`.
На странице грамматики он показывает поле `explanation`. Старые пояснения обычным текстом тоже подходят.

Поддерживаются заголовки, выделение, списки, цитаты и код. Учебный блок начинается с `:::тип` и заканчивается строкой `:::`. Блоки располагаются на верхнем уровне и не вкладываются друг в друга.

- `:::tip`, `:::note`, `:::example` принимают Markdown. В примере можно отделить перевод пустой строкой.
- `:::compare` принимает две строки `wrong: …` и `right: …`. Для нейтрального сравнения используйте `left: …` и `right: …`.
- `:::question` принимает вопрос и варианты, по одному на строку. Ровно один вариант начинается с `+`, остальные — с `-`. После `|` идёт пояснение выбранного варианта. В тексте варианта символ `|` можно записать как `\|`.

```md
:::question
Ты впервые рассказываешь о книге.
I bought ___ book yesterday.
+ a | Книга упоминается впервые.
- the | Этот артикль подходит, когда понятно, о какой книге речь.
:::
```

Выбор работает в браузере и сбрасывается при повторном открытии темы. HTML, ссылки и изображения отображаются как текст. Ошибочные блоки остаются читаемыми.

Проверки парсера запускаются командой `npm test -w apps/web`.

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
