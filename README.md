# Tint 🌈 - Tailwind CSS 4 Theme Plugin

**Tint** is a Tailwind CSS 4 plugin that generates **contrast-compliant** color theme palettes dynamically. It simplifies color theming by allowing you to define colors and tokens using a **declarative syntax** inside Tailwind CSS.

## 🚀 Features

- 🌇 **Light & Dark Mode** support with customizable lightness values.
- 🎨 **Contrast-compliant color tokens** for surfaces, actions, and highlights.
- ⚡ **Automatic color generation** using theme tokens.
- 📦 **Seamless Tailwind CSS 4 integration**.

---

## 📌 Installation

Install **Tint** via npm:

```sh
npx jsr add @skylerknight/tint
```

Or via pnpm:

```sh
pnpm dlx jsr add @skylerknight/tint
```

Or via deno:

```sh
deno add jsr:@skylerknight/tint
```

---

## 🧐 Usage

Add **Tint** as a plugin inside your Tailwind CSS configuration:

### **Defining a Theme**

You can configure your theme inside **Tailwind CSS 4** using the `@plugin` directive:

```css
@import 'tailwindcss';

@plugin '@skylerknight/tint' {
  name: light, dark;
  lightness: 85, 15;

  color-base: #ffffff, #000000;
  color-primary: #4483fe, #4483fe;
  color-secondary: #fe7544, #fe7544;

  token-surface: -1.35, -1.35;
  token-surface: -1.3, -1.3;
  token-surface-raised: -1.2, -1.2;
  token-surface-lowlight: -1.15, -1.15;
  token-surface-highlight: -1.1, -1.1;

  token-action: 3.5, 3.5;
  token-action-hover: 4, 4;
  token-action-active: 3, 3;

  override-action-brand-active: 3.25;
}
```

### **How It Works**

- The `name` property defines the theme modes (`light` and `dark`).
- `lightness` sets the base lightness for each mode.
- `color-base`, `color-primary`, and `color-secondary` define the primary color palette.
- `token-*` properties modify contrast ratios for surfaces, actions, and interactive elements.
- `override-*` allows fine-tuning specific color tokens.

---

## 🎨 Example Output

When using the above configuration, Tint will generate Tailwind CSS classes like:

```css
.bg-surface {
  background-color: var(--color-surface);
}

.text-action {
  color: var(--color-action);
}
```

---

## 📚 Documentation

For detailed documentation and advanced usage, check the [official docs](#) (Coming soon).

---

## 🤝 Contributing

We welcome contributions! Feel free to **open issues** or **submit pull requests** if you have ideas for improvements.

---

## 🛡️ License

This project is licensed under the **MIT License**.

---

## ⭐ Support & Feedback

If you find **Tint** useful, consider **starring** the repo! 🚀\
For feedback and support, open an issue or reach out on [Twitter](https://twitter.com/yourhandle).
