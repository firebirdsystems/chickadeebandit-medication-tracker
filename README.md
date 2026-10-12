# Medications

A [Chickadee Bandit](https://chickadeebandit.com/app-library/medication-tracker) app.

Track daily medications for every family member. Check off doses as they're taken, get a nudge at each scheduled time, and let a family member know when a dose is missed.

## Features

- Daily medication schedules per family member.
- Check off doses as they are taken.
- Every adult sees every shared medication, in the household or in a shared space, and can tick
  its doses, change it or archive it. A child sees and ticks only their own.
- A medication is shared with the other adults unless the person it is for marks it "Only me". A
  private medication, and its dose history, is theirs alone.
- A tick is undone by whoever made it or by the person the medication is for; at home any adult can
  undo one. Who a medication is for never changes once it is added.
- Adults add medications for themselves and for the children. In a shared space, every adult adds
  their own, and the steward adds for anyone; in a roster, the steward keeps the whole list.

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
the person asking can see in the app: every shared one for an adult, their own for anyone else.
A medication marked "Only me" appears on its owner's documents and no one else's.

## Install

In your hub, go to **Apps → Install from URL** and paste:

```
https://github.com/firebirdsystems/chickadeebandit-medication-tracker/releases/latest/download/bundle.json
```

## Development

See the [app-template](https://github.com/firebirdsystems/chickadeebandit-app-template) for build instructions and the full manifest field reference.
