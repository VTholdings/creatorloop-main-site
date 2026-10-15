# CreatorLoop corporate landing page — Owner QA build

This isolated static page reproduces the Owner-approved composition. It is not
wired into the existing root page, navigation, redirects, Functions, console,
training environment, or deployment configuration. It contains only the approved
corporate copy and one email link. No tracking, runtime JavaScript, forms, menus,
social links, or private Loop paths are included.

## Preview without deployment

Download `qa/owner-preview.html` and open it in a browser. It embeds the exact
page CSS and images, works offline, and makes no remote requests. Resize the
browser for desktop, laptop, tablet, and mobile QA. It is a real HTML page,
not a flattened mockup. The preview is generated from the source with:

```sh
python3 corporate/tools/package_preview.py
python3 corporate/tools/verify.py
```

The canonical source is `index.html`, `styles.css`, and `assets/` in this
directory. To inspect it locally, open `index.html`. No build/install is needed.
No preview server or live deployment was started in this mission.

## Design and asset custody

- `assets/approved-brand-artwork.webp`: lossless format conversion of the
  supplied 1536 × 1024 PNG. The original CL monogram and partner marks are
  displayed using SVG viewBox windows into its unchanged pixels. No brand
  marks were regenerated, recolored, stretched, or filtered. Their underlying
  source includes the approved artwork background; these are not standalone
  transparent logo masters.
- `assets/global-infrastructure.webp`: decorative background derived from the
  same approved image with the built-in image-generation tool, removing all
  text and logos while preserving the globe, brass architecture, lighting,
  and stage. WebP quality 92. This is the only generated/edited visual.
- The original uploaded PNG remains unchanged. All assets used by the page
  are in this VT-owned GitHub repository; no third-party asset URLs are needed.
- The background edit prompt is preserved in `qa/background-prompt.txt`.

## Additional partners

Append another `<li class="partner">` to the `partners` list. Put the original
logo file in `assets/`, then use an `<img class="partner-logo" ...>` with an
accurate `alt`, intrinsic `width` and `height`. Keep the original proportions
and colors. Flex wrapping accommodates additional marks; smaller screens can
grow vertically. Never add a partner link to the private Loop. Replace each
current SVG with a standalone original logo file when that asset is supplied.

## Responsive and accessibility behavior

- Large desktop uses the reference's centered, two-line headline and horizontal
  focus/partner rails. Short landscape laptops receive a compact composition.
- Tablet changes the focus rail to two columns; mobile retains readable body
  text and wraps as needed. Below 360px, partners and focus areas stack.
- No fixed page height, clipped content, `user-scalable=no`, or hidden horizontal
  overflow is used to conceal layout problems. There is no animation.
- Real heading, paragraph, list, footer, email, and named logo elements remain
  available to assistive technology. The background/monogram are decorative.
- Staging source includes `noindex, nofollow`; remove only during a separately
  approved production launch. Copyright is deliberately the approved 2026 copy.

## Deployment hold

Do not merge/deploy this build or change DNS. Do not migrate the existing root
experience. That later move to `loop.creatorloop.net` is a separate mission.
The current production source remains byte-for-byte unchanged. The GitHub
commit starts with `[CF-Pages-Skip]` to suppress the existing Pages branch
deployments without changing Cloudflare configuration. No PR is opened in
this mission, avoiding an additional deployment trigger.

## Verification limits

See `qa/verification.json` for automatic source/package checks. A supported
browser-control skill is not available in this environment, so no browser
render, viewport overflow measurement, screenshot comparison, or screen-reader
audit is claimed. Owner visual QA is pending using the offline preview.
