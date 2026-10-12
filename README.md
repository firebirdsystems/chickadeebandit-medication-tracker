# Medications

A [Chickadee Bandit](https://chickadeebandit.com/app-library/medication-tracker) app.

Track daily medications for every family member. Check off doses as they're taken, get a nudge at each scheduled time, and let a family member know when a dose is missed.

## Features

- Daily medication schedules per family member.
- Check off doses as they are taken.
- Adults see all children's schedules.
- Each adult manages the sharing of their own medications.

## Printed lists

The Manage tab offers two documents, rendered by the hub from the manifest's `reports`:

- **Current medications**: every medication being taken today, with its dose, times and days, by
  person. The list to hand a doctor or a pharmacist. A course that has ended or has not started is
  left out, and so are archived medications.
- **Doses taken**: every dose ticked off in the last 90 days, by person. A dose that was not ticked
  does not appear. Each tick keeps the dose the medication had at the time, so a later change of
  dose does not rewrite the history. A tick made before the app recorded this shows the current
  dose and says so.

Each opens ready to print or save as a PDF, or downloads as CSV. A document holds the medications
the person asking can see in the app: the whole household's for an adult, their own for anyone
else, and in a shared space everyone's for the steward only.

## Install

In your hub, go to **Apps → Install from URL** and paste:

```
https://github.com/firebirdsystems/chickadeebandit-medication-tracker/releases/latest/download/bundle.json
```

## Development

See the [app-template](https://github.com/firebirdsystems/chickadeebandit-app-template) for build instructions and the full manifest field reference.
