# MikeyTime Ring Studio changelog

## v1.5.0

### New
- **Display settings gear** in the top-right corner of the preview. It opens a pop-up with the bottom ruler (scale and offset), measurement overlays (gem widths, gaps, vertical drop and label size), Hide shadows on 2D view, and a new **Show measurements under preview** switch for the ring size / bore / outer diameter / band / parts readout, which is now off by default.
- **Print settings pop-up.** In 3D Model view, a Print settings button next to the view switch opens stone depth, setting height, max socket depth, band cutout mode, separate prongs/bezels and STL/3MF export. The old 3D Print Settings section is gone.
- **Custom band color.** Metal now has a fourth option, Custom, with a color picker. It shows in the blueprint (with its own metal shading), the 3D model, exports and the BOM. Bezels can use it too (Custom (band color)).
- **Custom setting on each stone.** Setting height, stone depth and max socket depth for a single stone are now set at the bottom of that stone's card: turn on Custom setting and sliders appear, starting from the stone's automatic values. This replaces the single per-stone switch in 3D Print Settings; designs saved with that switch on load with Custom setting turned on for the stones that had values.
- **Hover help.** Most sliders, switches and pickers have an ⓘ icon and hover text explaining what they do.

### Improved
- **Band Settings** (was Band & Blueprint) holds everything about the band: metal, US ring size (with the bore diameter), band width, band thickness, band profile, and Hide shadows on 2D view (also in Display settings). It has a new band icon.
- Canvas zoom is a slider under the 2D preview.
- Each stone's title names it: "Stone 1 Oval Ruby", or "Round Brilliant Custom Gemstone" for a custom color.
- "Flat Band (No 3D/Shadow)" is renamed "Hide shadows on 2D view".

## v1.4.0

### New
- **Real stone proportions in 3D.** Every stone is built with its cut's standard depth as a share of its width (Princess 70.4%, Asscher 68.1%, Radiant 67%, Cushion 65.9%, Emerald 65%, Hexagon 63.2%, Oval 62.1%, Round 61.3%, Pear and Marquise 61.2–61.3%, Heart 60%; Crescent Moon 60% is an estimate). The depth is split into a crown (15%), girdle (3%) and a pavilion cone (82%) narrowing to the culet, so stones look like cut gems instead of thin plates. A 6.4 mm round is 3.94 mm deep.
- **Stone Depth** (3D Print Settings): scale all stones from 60% to 140% of their standard depth, or set a single stone's depth in millimetres.
- **Setting Height** replaces Gem Relief Height. It sets how high each stone's girdle sits above the band. On Auto, each stone sinks as deep into its socket as the Max Socket Depth allows and its setting raises it the rest of the way, so small stones sit low and large stones sit up on taller prongs like a real head. You can also set it for all stones or per stone.
- **Stone cards** show each stone's width × length × depth and how high its girdle sits above the band.
- **Carat sizing.** Each stone's Size can be Manual width or Carat. Carat picks from 0.25 ct to 3.00 ct and uses standard diamond measurements (length × width × depth) for every cut except Crescent Moon, which has no standard chart. Diamond, Ruby, Sapphire, Emerald and Aquamarine are sized for their own density (ruby and sapphire are 4.2% smaller than diamond at the same weight; emerald and aquamarine 9.1% larger), and the card notes "Displaying Carat Measurements Based on Selected Stone's Density". Other gemstones and custom colors use diamond-equivalent sizes, noted "Displaying Diamond Equivalent Weight for Carat Selection". The BOM lists carat-sized stones with their weight, marking diamond-equivalent ones.

### Improved
- Sockets are cut to the pavilion's cross-section where it meets the band, so the stone's cone seats into the band. Stones wider than the band are raised just enough for that cross-section to fit between the band's rims.
- Prongs, bezels and halos are sized from each stone's real girdle and crown: prongs reach up past the girdle over the crown's edge, a bezel becomes a cup that wraps a raised stone, and a halo's deck sits just under the center stone's girdle. Halo stones use real proportions too.
- Flush settings set the table level with the band when the whole stone fits within the band's depth and width, and explain why when it doesn't.
- "Carved Socket Depth" is now "Max Socket Depth", the deepest a stone may sink into the band.
- The bill of materials lists each stone as width × length × depth, with its girdle height above the band and actual socket depth.
- **Pear and Marquise** now fill their full stated width (they were about 14% and 18% narrower).
- **Standard proportions from the carat chart.** Each cut's automatic depth is the chart's average depth ÷ width, and length-to-width ratios now match it: Marquise 2.0 (was 1.8), Pear 1.55 (was 1.5), Heart 1.0 (was 0.9), Radiant 1.32 (was 1.3). Hexagon width is now measured flat-to-flat like the chart (its point-to-point length is 1.155 × that), which also corrects hexagon depth (a 1 ct hexagon was 4.4 mm deep; it is now 3.7 mm). Saved designs using these shapes will look slightly different.

### Fixed
- Rare mesh defects where a socket corner or edge lined up almost exactly with the band's grid. Tested watertight across 4,500 random designs plus fixed sweeps of every shape, size, offset, rotation and band profile.

## v1.3.1

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
