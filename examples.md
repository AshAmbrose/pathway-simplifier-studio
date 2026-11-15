# Test figures

The images live in `local/examples/` (gitignored). This file records where each open-access figure came from
and under what licence. Any other test figures are used locally only and are never committed or listed here.

| # | File | Figure | Source | Licence | Why it is in the set |
|---|---|---|---|---|---|
| 1 | `jakstat-hu2021-fig3.jpg` | Activation and negative regulation of JAK/STAT signalling (Fig. 3) | Hu X, et al. *Signal Transduct Target Ther* 2021;6:402. [doi:10.1038/s41392-021-00791-1](https://doi.org/10.1038/s41392-021-00791-1) | CC BY 4.0 | Medium. Numbered steps, dashed inhibition lines, several negative regulators (PTPs, SOCS, PIAS), one regulator drawn twice (PTPs) |
| 2 | `nfkb-yu2020-fig1.jpg` | Activation and regulation of the canonical NF-κB pathway (Fig. 1, panels a–d) | Yu H, et al. *Signal Transduct Target Ther* 2020;5:209. [doi:10.1038/s41392-020-00312-6](https://doi.org/10.1038/s41392-020-00312-6), [PMC7506548](https://pmc.ncbi.nlm.nih.gov/articles/PMC7506548) | CC BY 4.0 | Hard. Four receptor panels converging on one IKK complex; the same molecules (TAB2/3, TAK1, RIP1, TRAF6) drawn several times; ubiquitin chains; an endosome |
| 3 | `nfkb-guo2024-fig1.jpg` | Overview of canonical and non-canonical NF-κB signalling (Fig. 1) | Guo Q, et al. *Signal Transduct Target Ther* 2024. [doi:10.1038/s41392-024-01757-9](https://doi.org/10.1038/s41392-024-01757-9), [PMC10910037](https://pmc.ncbi.nlm.nih.gov/articles/PMC10910037) | CC BY 4.0 | Hard. Nine receptors, two pathways side by side, regulators acting on several targets (A20, CYLD, LUBAC), outcomes in boxes |
| 4 | `wnt-liu2022.jpg` | Wnt/β-catenin pathway, inactive vs active (Fig. 1) | Liu J, et al. *Signal Transduct Target Ther* 2022;7:3. [doi:10.1038/s41392-021-00762-6](https://doi.org/10.1038/s41392-021-00762-6) | CC BY 4.0 | Easy to medium. Two states side by side, so every molecule appears twice; the difference between panels is the science |
| 5 | `wp364/WP364.png` (+ `.gpml`, `.svg`, `-datanodes.tsv`) | IL6 signaling pathway (Homo sapiens) | WikiPathways [WP364](https://www.wikipathways.org/pathways/WP364) (derived from NetPath) | CC0 | Exact answer key from the GPML (63 nodes, 68 interactions, 12 groups). Same biology as a hand-drawn IL-6 figure but in database notation: tests reading the drawing, not recalling the textbook |

## Resolutions
- `local/examples/*.jpg`: the web previews (about 700 px wide), as served on PMC.
- `local/examples/fullres/*.springer.png`: the publisher's full-size versions (1745–1797 px wide) of figures 1–4, same licence.
