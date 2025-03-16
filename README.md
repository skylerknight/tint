# **Tint 🌈 - Tailwind CSS Theme Manager**

**Tint** is a **theme management plugin** for **Tailwind CSS 4**, allowing you to define, organize, and apply themes dynamically. It provides a structured way to manage colors and tokens, ensuring **consistency** and **contrast compliance** across light and dark modes.

## **🚀 Features**

- 🎨 **Multiple Theme Support** – Easily define and switch between themes.
- 🌗 **Light & Dark Modes** – Customize themes with fine-tuned lightness values.
- ⚡ **Token-Based Styling** – Define reusable tokens for surfaces, actions, and interactive elements.
- 📦 **Seamless Tailwind Integration** – Works with `@config` in Tailwind CSS.

---

## **📌 Installation**

### **Using npm:**

```sh
npx jsr add @skylerknight/tint@latest
```

### **Using pnpm:**

```sh
pnpm dlx jsr add @skylerknight/tint@latest
```

### **Using Deno:**

```sh
deno add jsr:@skylerknight/tint@latest
```

---

## **🛠️ Setting Up Tint**

### **1️⃣ Create a `tint.config.js` File**

Define your themes inside `tint.config.js`:

```js
import tint from '@skylerknight/tint';

export default tint({
  defaults: {
    theme: 'light',
  },
  themes: [
    {
      name: 'light',
      lightness: 85,
      colors: {
        base: '#ffffff',
        brand: '#f87c17',
      },
      tokens: {
        surface: {
          default: -1.15,
          well: -1.1,
          raised: -1.2,
          lowlight: -1.3,
          highlight: -1.35,
        },
        action: {
          default: 4,
          hover: 5,
          active: 6,
        },
        on: {
          surface: 12,
          action: -2,
        },
      },
    },
    {
      name: 'dark',
      lightness: 20,
      colors: {
        base: '#000000',
        brand: '#f87c17',
      },
      tokens: {
        surface: {
          default: -1.3,
          well: -1.35,
          raised: -1.2,
          lowlight: -1.15,
          highlight: -1.1,
        },
        action: {
          default: 4,
          hover: 5,
          active: 6,
        },
        on: {
          surface: 12,
          action: -2,
        },
      },
    },
  ],
});
```

---

### **2️⃣ Load Tint in Tailwind CSS**

Modify your **main Tailwind CSS file** (`app.css` or `global.css`):

```css
@import 'tailwindcss';
@config './tint.config.js';
```

This ensures that Tailwind processes the themes defined in `tint.config.js`.

---

## **🎨 How Tint Works**

- **Themes** are defined as objects inside `tint.config.js`.
- **Light & Dark Modes** are managed using `lightness` values.
- **Tokens** allow structured styling with reusable values.
- **Variants** define how themes switch dynamically.

---

## **📦 Example Output**

Tint will generate tailwind utility classes based on your configuration tokens like:

```css
.bg-surface {
  background-color: var(--color-surface);
}

.bg-surface-raised {
  background-color: var(--color-surface-raised);
}

.bg-action {
  color: var(--color-action);
}

.bg-action\:hover {
  color: var(--color-action-hover);
}

.bg-action\:active {
  color: var(--color-action-active);
}

.text-on-action {
  color: var(--color-on-action);
}
```

which can then be used like so:

```html
<article class="bg-surface-raised p-8 rounded-xl">
  <button class="bg-action text-on-action hover:bg-action-hover active:bg-action-active">Save</button>
</article>
```

---

## **🤝 Contributing**

We welcome contributions! Feel free to open issues or submit pull requests.

---

## **🛡️ License**

This project is licensed under the **MIT License**.

---

## **⭐ Support & Feedback**

If you find **Tint** useful, consider **starring** the repo! 🚀\
For feedback and support, open an issue or reach out on [Twitter](https://twitter.com/yourhandle).
