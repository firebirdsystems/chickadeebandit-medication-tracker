# Medications

A [Chickadee Bandit](https://chickadeebandit.com/app-library/medication-tracker) app.

Track daily medications for every family member. Check off doses as they're taken, get a nudge at each scheduled time, and let a family member know when a dose is missed.

## Features

- Daily medication schedules per family member.
- Check off doses as they are taken.
- Every adult sees every shared medication, in the household or in a shared space, and can tick
  its doses, change it or archive it. A child sees and ticks only their own.
- A medication is shared with the other adults unless the person it is for marks it "Only me". A
  private medication, and its dose history, is theirs alone: no other adult can see it or change
  who does. A child's medication stays shared with the adults; an adult chooses who else sees it.
  At home or in a general space any adult can change who sees a medication they can see, another
  adult's shared one included (the hub allows it); the page offers the choice only on your own
  medications, and on a child's or guest's. In a co-parenting space the hub keeps each parent's
  own medications theirs: a parent changes, removes or re-shares only their own and the children's.
- A household can name a **care team**: a member group (a nanny who signs in as a guest, a
  grandparent) that sees every medication marked "Adults and the care team" and ticks its doses.
  A guest or a child on the care team sees nothing else; an adult on it keeps everything the adults
  see. The adults' own medications stay as they are. An admin chooses the group
  under **Care team** on the Manage tab (the hub's member settings decide who is in it); until
  then the choice is not offered. A guest reaches the app only if it is granted to them (ticked
  in their guest invite), so a guest on the care team needs the app granted too. The care team never adds, edits or archives a medication. A
  guest on the care team sees and ticks the doses but is not sent reminders or missed-dose alerts
  (the hub notifies no guest), so the form's Remind and Missed-dose lists leave guests out; an
  adult on the care team can be chosen there as before.
- A reminder goes to the person the medication is for unless other people are chosen. A private
  medication reminds that person only, and its missed-dose alert can go to nobody else.
- A tick is undone by whoever made it or by the person the medication is for; at home any adult can
  undo one, and in a co-parenting space either parent can undo one on a child's medication (a tick
  on a parent's own medication is undone by its writer or that parent). Who a medication is for
  never changes once it is added.
- Adults add medications for themselves and for the children. In a shared space, every adult adds
  their own, and the steward adds for anyone; in a roster, the steward keeps the whole list.
- In a co-parenting space either parent adds and maintains a child's medication: the form's "For"
  list offers yourself and the children, never the other parent. Reminders follow the medication's
  owner and the people chosen for it, as everywhere else. Each parent's own medications stay theirs:
  a medication cannot be added for the other parent.
- A medication can carry its prescriber, its pharmacy and the day its next refill is due. Five days
  before that day the hub emails the person it is for and the adults who can see the medication (a
  private one reminds its owner alone), and the Today tab says "Refill due in 2 days" until it is
  dealt with. Pressing **Refilled** moves the date on by the medication's refill interval, or clears
  it when there is none. Archiving a medication drops its refill date.

## Printed lists

The Manage tab offers two documents, rendered by the hub from the manifest's `reports`:

- **Current medications**: every medication being taken today, with its dose, times, days,
  prescriber, pharmacy and next refill, by person. The list to hand a doctor or a pharmacist. A course that has ended or has not started is
  left out, and so are archived medications.
- **Doses taken**: every dose ticked off in the last 90 days, by person. A dose that was not ticked
  does not appear. Each tick keeps the dose the medication had at the time, so a later change of
  dose does not rewrite the history. A tick made before the app recorded this shows the current
  dose and says so.

Each opens ready to print or save as a PDF, or downloads as CSV. A document holds the medications
the person asking can see in the app: every shared one for an adult, the care medications for the
care team, their own for anyone else.
A medication marked "Only me" appears on its owner's documents and no one else's.

## Install

In your hub, go to **Apps → Install from URL** and paste:

```
https://github.com/firebirdsystems/chickadeebandit-medication-tracker/releases/latest/download/bundle.json
```

## Development

See the [app-template](https://github.com/firebirdsystems/chickadeebandit-app-template) for build instructions and the full manifest field reference.
