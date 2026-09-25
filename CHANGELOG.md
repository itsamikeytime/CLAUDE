# MikeyTime Ring Studio changelog

## v1.31

### Fixed
- **PNG and SVG export now work from the 3D view.** Both export the 2D blueprint; they used to do nothing unless the 2D view was showing.

### Improved
- Link previews and the browser-tab icon: the page now carries its title, description, preview image and favicon for sharing.

## v1.3

### New
- **Band profiles.** Choose Flat, Beveled or Rounded edges in 3D Print Settings, with a slider for the bevel width or dome height (or leave it on Auto). Sockets, prongs, bezels and halos follow the band's surface, and the 2D blueprint shading matches the profile.
- **Undo and redo** for every design change, from the header buttons or Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (Ctrl+Y also redoes). Slider drags and typed numbers count as one step each.
- **Notes on each stone** when the app adjusts your design or a part may be hard to print. Examples: a socket narrowed to fit the band, a socket depth that was capped, too little metal under a socket, or prongs leaning in to reach the band.
- **Complete bill of materials.** The BOM now lists the band (metal, ring size, bore, width, thickness, profile), every stone, and each halo's stones grouped by color with counts, so it works as an order list.
- **Version number** in the header, in saved designs, and in STL/3MF exports. Loading a design saved by a newer version shows a notice.
- **Type any value.** Number boxes keep values beyond their slider's range when you press Enter or click away; the slider stretches to match. Per-stone relief and socket depth are now typed fields instead of dropdowns.

### Improved
- **Redesigned interface.** The 2D Blueprint / 3D Model switch sits directly above the preview, with camera presets and Explode beside it in 3D and zoom buttons in 2D. A measurements strip under the preview shows ring size, bore, outer diameter, band size and part count. The Cluster/Scatter layout switch moved to the Stones section.
- **Stones wider than the band** get a socket shaped like the stone, shrunk to leave solid rims, and placed over the part of the stone that actually covers the band. Prong feet past the band edge lean in; bezel and halo bases stay on the band.
- **Settings hug their stones.** Bezels and halos stay level with the stone all the way round instead of dropping away along the ring.
- **Exploded view** separates band, setting and stone cleanly without stretching any part.
- **2D facet drawings** follow each shape's real outline (brilliant, step-cut and crescent patterns).
- **Unique halo colors** now show in 3D and export as separately named parts for multi-color printing.
- **True Heart and Crescent Moon shapes.** The heart now has two round lobes, a sharp notch and a pointed tip; the crescent is a true crescent (a circle with an overlapping circle cut away) with circular edges and sharp horns. The crescent is naturally taller than it is wide (height = 1.36 × width) and the heart slightly wider than tall (height = 0.9 × width), so saved designs using these shapes will look different. Prongs, V-prong claws, bezels and halos follow the new outlines.

### Fixed
- The 3D preview no longer stretches round stones into ovals on shorter screens.
- Exported band meshes are watertight in every size combination tested.
- Faint square boxes around prong shadows in 2D.
- Crescent prongs that floated off the stone.
- Crescent Moon stones in 3D no longer fill in their hollow with straight edges.
- Halo stones and bezels no longer overlap or glitch at a heart's notch.
