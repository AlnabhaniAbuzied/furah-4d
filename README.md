# Al-Furaih Villa 4D

A 4D view of the villa's structure that opens in any browser, on a computer or a phone, with nothing to install. Each element of the Revit structural model is coloured from the AHB project dashboard (`furah.html`): what is built, what is in progress, and what is planned for next week.

It looks like the AHB Projects Dashboard: a black bar with the ahb mark, figures in a monospaced font, and the same pale-yellow main button. The black bar holds the data date, where the data came from, and three buttons:

- **العربية / English** switches language (right-to-left layout in Arabic; the exported A4 sheet stays in English).
- **Light mode / Dark mode** switches the colours. It starts dark, like the dashboard, and each phone or computer remembers its choice.
- **Refresh now** reads the dashboard again at once (on computers; on phones, reload the page).

First-time visitors get a 3-step **Quick tour**; it can be opened again from the link at the bottom of the side panel.

## Put it online (once, about 3 minutes)

Whoever publishes the dashboard can do this:

1. Sign in to GitHub and open the **ahb-dashboard** repository.
2. Click **Add file**, then **Upload files**. Drag this whole **furah-4d** folder onto the page and click **Commit changes**.
3. After a minute or two, open **https://engahmedkhodier-hash.github.io/ahb-dashboard/furah-4d/** and share that link.

If you cannot upload to ahb-dashboard, any GitHub repository with Pages turned on works: upload the files, then open **Settings**, **Pages**, choose **Deploy from a branch**, branch `main`, and **Save**. The 4D still reads the dashboard live.

## Every week (about 10 minutes)

The same steps are in the 4D itself: press **How to update** under the title.

1. **Update the dashboard** as usual and press **Publish to live link**. The 4D reads it by itself. Open the 4D and check that the data date at the top is the new one, marked **Live**.
2. **Add site notes** for work seen on site after the data date (see "Site updates" below).
3. **Link inspections and photos** (optional): add lines to `documents.csv` (see "Inspections, photos and documents" below).
4. **Look at Data health** at the bottom of the side panel. It should say "all good".
5. **Make the weekly report pictures**: press **Next week** at the top of the model, then **Share** and **Download PDF**. For work done: **Last week**. For delays: **Plan vs actual**, **Show only these in 3D**, then **Share**.

## What updates by itself

- **Progress and dates** come from the dashboard on every visit, and every 15 minutes while the page stays open. Allow up to 10 minutes after the dashboard is published.
- **This week and next week** move forward with the calendar. Weeks run Friday to Thursday, like the dashboard.
- **If the dashboard cannot be read** (no signal, or its format changes), the 4D keeps showing the last good copy saved on that phone or computer, puts a "Showing data from ..." note at the top, and tries again every 15 minutes. **Data health** says what went wrong.

## Site updates (when site is ahead of the dashboard)

The easy way: in the 4D, open **Add a site update** (or tap an element, then **Update progress**), fill it in and press **Show it in the 4D**. Your screen shows it straight away, and the page gives you the line to add to the file.

To share it with everyone:

1. On GitHub, open **furah-4d/site-updates.csv** and click the pencil icon (**Edit**).
2. Paste the line at the end and click **Commit changes**. Everyone sees it within about 10 minutes.

The file is a simple table with one line per activity:

```
date,activity,percent,by,note
2026-11-25,SP.GF.06,100,Nabhani,GF beam steel fixed
```

- **date**: the day the work was seen on site, written 2026-11-25 or 25/11/2026.
- **activity**: the dashboard activity ID, for example SP.GF.06 (FUR.M.C. can be left out).
- **percent**: 0 to 100, or `done`.
- A line only counts while its date is after the dashboard's data date. Once the dashboard is updated past that date, the dashboard's own figures take over, so old lines can stay in the file.
- If a line has a mistake, the 4D lists it under Site updates with its line number.
- The file also opens in Excel. Save it as CSV again when you are done.

## Inspections, photos and documents

Tap any element to open its card. The card lists the WIR, MIR, photos and other documents linked to its activities, each with an **Open** button. They come from `furah-4d/documents.csv`, one line per document:

```
date,activity,type,ref,status,link,note
2026-11-24,SP.GF.06,WIR,25008-WIR-STR-016,A,https://your-sharepoint-link,GF beams steel fixing
2026-11-25,SP.GF.05 SP.GF.06,Photo,,,https://your-sharepoint-link,GF beams before casting
```

- **activity**: one or more dashboard activity IDs, separated by spaces.
- **type**: WIR, MIR, RFI, NCR, Photo, Drawing or anything else.
- **status**: A, B, C or D (approval code), or leave it empty.
- **link**: a SharePoint or OneDrive share link to the file or folder. People need access to that link to open it.
- Lines starting with `#` are ignored, so the examples in the file do nothing until you add your own lines.

## Sharing a view and weekly reports

- **Last week** shows what was built since the previous weekly dashboard update, numbered on the model.
- **Next week** greys out everything except next week's work and numbers it on the model.
- **Plan vs actual** lists the **Top delays**: work behind the baseline plan, the most days late first. Days late compare the dashboard's forecast finish with the baseline.
- **Share**, at the top of the model, saves the current view as an A4 PDF or a picture with the AHB title block (project, view, data date, issue date), ready for the weekly report. **Copy link** gives a link that opens exactly what you see: the colours, floor, week, date, language and camera angle.
- **Reset** brings the whole building and the default view back.

## What does not update by itself

- **The 3D model.** It is an export of `25008-AHB-ZZZ-XXX-CD-STR-00.rvt` taken on 25 Nov 2026. When the structural model changes (elements added, removed or moved), the export is run again and `model.json` is replaced. Progress colours do not need this.
- **Other models.** Only the structure is in the 4D today. The MEP models (drainage, HVAC, water supply, electrical) can be added later as extra layers.
- **The link between elements and activities.** It goes by the model's BOQ SUBSECTION code (for example 3.4.1 is ground floor columns). If structural activities in the dashboard are renamed, split or added, the link may need an update. The page's "How the model is linked to the dashboard" section shows the full table.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js` | The page |
| `logos.js` | The AHB logos for exported sheets |
| `model.json` | The 3D structure, exported from Revit |
| `snapshot.json` | A saved copy of the dashboard data (data date 19 Nov 2026), used only when the dashboard cannot be reached |
| `snapshot-prev.json` | The dashboard data of the week before (12 Nov 2026), used for **Last week** only when the dashboard's GitHub history cannot be read |
| `site-updates.csv` | Site progress seen after the dashboard's data date |
| `documents.csv` | Links to WIR, MIR, photos and documents, shown on the element cards |
