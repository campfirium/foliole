# Foliole component previews

After installing the repository dependencies, run `npm run ladle` and open
[127.0.0.1:61000](http://127.0.0.1:61000).

Open **Review settings → Full pane** to see the entire Review settings pane.
Use fullscreen to give the pane more room. The **Settings row** stories are
for editing a single row in isolation.
Open **Review settings → Review order proposal** to try the queue explanation,
priority weight, and example probabilities.

Choose a story in the sidebar. Use **Controls** to try copy and input values,
and the theme and width controls to check how the component looks. Controls
change the preview for the current story. Update the relevant source or story
file to keep an agreed change. Reload the story after changing its default
Controls values.

Add examples in `scripts/ladle/stories/` as `*.stories.tsx` files. Import the actual
component and supply example inputs or local state. The preview provider loads
Foliole's stylesheet and applies its default light or dark palette. Components
that depend on desktop services can receive example data at that boundary.
