# Newsletters

Built PDFs live here. The season pages link to them by name, so the filename
is the contract:

```
newsletters/SLUH22-<season>-Week<week>-Newsletter.pdf
```

which is exactly what `tools/newsletter/build.mjs` already writes. To publish a
week, build it into this folder and commit the file:

```bash
node tools/newsletter/build.mjs --season 2026 --week 5 --box week5-box.json --out newsletters
```

The page does not keep a list of which weeks have a newsletter — it asks for
the file and only shows the download button when the file answers. Dropping a
PDF in here is the whole publishing step, and removing one takes the button
away again.

Only build with `--box` for anything committed here. `--fake` fabricates
player lines and stamps the sheet SAMPLE; that is for layout review, not for
the league to read.
