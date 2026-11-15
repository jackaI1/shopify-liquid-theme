# shopify-liquid-theme

Project by Jack Lai

I built a small online-store theme for a made-up meal-delivery shop, Fresh Plate Kitchen, because I wanted to learn how Shopify themes work from the inside. A Shopify theme is the set of files that decides how a store looks and behaves: the home page, the product pages, the cart and the editable blocks a store owner can move around. Stock themes do all of that, but they are hard to read. I wanted a small one I wrote myself, that I could change and test on my own computer.

Every product, price and address in it is fictional.

## What it does

- **Home page** with a hero banner and a three-step "How it works" section. The store owner can change the wording, the button and the image in the Shopify editor.
- **Product page** with a portion picker. When the customer picks a different portion, the price on the page updates without reloading.
- **Collection page** that lists meals in a grid, 12 per page, with page links.
- **Cart drawer.** The cart slides in from the right instead of opening a new page. It shows a bar that fills up as the customer gets closer to free delivery, lets them change quantities, and has two delivery options: a note for the driver and a "leave at the door" tick box.

The delivery options are saved on the cart itself, so the packing team can read them on the order. The free-delivery amount is a setting in the theme editor, so the shop owner can change it without touching code.

## How it works

Shopify runs themes written in Liquid, its template language. Liquid puts values like product names into HTML. A page is built from:

1. **Layout** (`layout/theme.liquid`). The outer HTML that every page shares: the head, the header, the footer and the cart drawer.
2. **Templates** (`templates/*.json`). One file per page type. Each one lists which sections appear on that page and in what order.
3. **Sections** (`sections/*.liquid`). Blocks of the page, such as the hero or the product details. Each section has a `schema`, a short JSON block that tells Shopify which settings the store owner can edit.
4. **Snippets** (`snippets/*.liquid`). Small parts that other files reuse, like the product card and the cart drawer.
5. **Assets** (`assets/`). The stylesheet and the JavaScript. The cart drawer runs in the browser and talks to Shopify's cart endpoints (`/cart.js`, `/cart/add.js`, `/cart/change.js`, `/cart/update.js`). These send and receive plain JSON.

The JavaScript for the cart is in one file, [`assets/cart-drawer.js`](assets/cart-drawer.js). The top half holds plain functions with no page access: formatting money, working out the free-delivery progress, cleaning up the delivery note, and building the request body for a quantity change. Those functions are what the tests check. The bottom half connects them to the page.

## What was built

- [`layout/theme.liquid`](layout/theme.liquid): the shared page frame.
- [`templates/`](templates): the home, product and collection page layouts.
- [`sections/meal-hero.liquid`](sections/meal-hero.liquid) and [`sections/how-it-works.liquid`](sections/how-it-works.liquid): the two editable home-page sections. The second one has repeatable step blocks.
- [`sections/main-product.liquid`](sections/main-product.liquid) and [`sections/main-collection.liquid`](sections/main-collection.liquid): product and collection pages.
- [`snippets/cart-drawer.liquid`](snippets/cart-drawer.liquid): the cart drawer markup.
- [`assets/cart-drawer.js`](assets/cart-drawer.js): cart behaviour, the delivery add-ons and the variant price.
- [`assets/base.css`](assets/base.css): the styles.
- [`config/settings_schema.json`](config/settings_schema.json): the theme settings (store tagline, free-delivery amount, colours).
- [`tests/`](tests): unit tests for the cart functions and checks that the template and section files point at each other correctly.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml): the workflow that runs the tests and Theme Check on every push and pull request.

## How to try it

You need Node.js 20 or newer.

Run the tests:

```bash
npm test
```

Run Shopify's own linter, Theme Check:

```bash
npm run theme:check
```

To preview the theme in a store, make a free Shopify development store, then run:

```bash
npm run theme:dev
```

The Shopify CLI will ask you to log in and choose the store. The preview then updates as you edit files.

## Tests and checks

- **Unit tests (18 tests, all passing).** They cover the money formatting, the free-delivery maths (exactly at the threshold, above it, and with a negative subtotal), cleaning up the delivery note (control characters, whitespace, a 140-character limit), the rule that always sends both delivery keys so an old value can be cleared, and clamping quantities between 0 and 99.
- **Structure tests.** These read every template, section and snippet and check that each file they name exists, that each setting a template sets is defined in its section schema, and that each `section.settings` value used in Liquid is defined too. A typo in a setting name would otherwise only show up in the store.
- **Theme Check.** Shopify's official linter, run through Shopify CLI in GitHub Actions. The latest run reported no offenses across 16 files.

## Status and limits

I have not yet run the theme on a live development store, so there are no screenshots yet, and I have not clicked through the cart drawer in a browser. The checks above confirm that the Liquid and JSON are valid and that the cart logic behaves as the tests describe. Shopify handles checkout, payments and stock levels, and this theme does not change them.
