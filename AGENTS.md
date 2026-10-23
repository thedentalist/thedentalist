# Repository Guidance

## Project Structure
- This is a static bilingual website; Hungarian pages are in the repository root and English pages are in `en/`.
- Shared styles, scripts, translations, price lists, and media are in `assets/`.
- Keep language-specific pages, navigation, metadata, and URL paths consistent between the Hungarian and English versions where corresponding pages exist.
- Preserve the existing public URLs and SEO-related files, including canonical and alternate-language links, `sitemap.xml`, `robots.txt`, and `CNAME`.

## Editing Conventions
- Follow the existing HTML, CSS, and JavaScript style. Keep changes focused and avoid introducing a framework or build system for this static site.
- Use the existing shared assets and translation/price-list data rather than duplicating content in page markup when the site already loads that data dynamically.
- Preserve asset paths appropriate to page location: root pages use paths such as `assets/...`; pages under `en/` generally use `../assets/...`.

## Verification
- There is no package manifest or configured automated test suite. Do not assume build, lint, or test commands are available.
- For HTML or asset changes, check affected links and relative paths, and verify corresponding language pages when applicable.
- For JavaScript behavior that depends on `fetch`, validate through an HTTP-served site rather than opening the page directly from the filesystem.