/**
 * The open-licence figures bundled with the app (images in public/examples/), so visitors to the hosted demo can
 * try it without finding a figure of their own. Each shows its source and licence wherever it appears.
 * `savedRun` is the ready-made result for that figure (copied into the demo by scripts/seed-demo.ts), which opens
 * at once without a model call.
 */
export interface Example {
  file: string;
  title: string;
  credit: string;
  licence: string;
  link: string;
  savedRun?: { id: string; from: string };
}

export const EXAMPLES: Example[] = [
  {
    file: '/examples/nfkb-guo2024.jpg',
    title: 'NF-κB, canonical and non-canonical (Guo 2024)',
    credit: 'Guo Q, et al. Signal Transduct Target Ther 2024, Fig. 1',
    licence: 'CC BY 4.0',
    link: 'https://doi.org/10.1038/s41392-024-01757-9',
    savedRun: { id: '20261115-181432-example-nfkb-guo-2024', from: '20261115-181432-guo2024-nfkb-v3' },
  },
  {
    file: '/examples/nfkb-yu2020.jpg',
    title: 'NF-κB activation and regulation (Yu 2020)',
    credit: 'Yu H, et al. Signal Transduct Target Ther 2020;5:209, Fig. 1',
    licence: 'CC BY 4.0',
    link: 'https://doi.org/10.1038/s41392-020-00312-6',
    savedRun: { id: '20261115-181432-example-nfkb-yu-2020', from: '20261115-181432-yu2020-nfkb-v3' },
  },
  {
    file: '/examples/jakstat-hu2021.jpg',
    title: 'JAK/STAT signalling (Hu 2021)',
    credit: 'Hu X, et al. Signal Transduct Target Ther 2021;6:402, Fig. 3',
    licence: 'CC BY 4.0',
    link: 'https://doi.org/10.1038/s41392-021-00791-1',
    savedRun: { id: '20261115-181431-example-jak-stat-hu-2021', from: '20261115-181431-hu2021-jak-stat-v3' },
  },
  {
    file: '/examples/wnt-liu2022.jpg',
    title: 'Wnt/β-catenin, inactive and active (Liu 2022)',
    credit: 'Liu J, et al. Signal Transduct Target Ther 2022;7:3, Fig. 1',
    licence: 'CC BY 4.0',
    link: 'https://doi.org/10.1038/s41392-021-00762-6',
    savedRun: { id: '20261115-180953-example-wnt-liu-2022', from: '20261115-180953-wnt-liu2022-v3' },
  },
  {
    file: '/examples/il6-wp364.png',
    title: 'IL-6 signalling (WikiPathways WP364)',
    credit: 'WikiPathways WP364, Homo sapiens',
    licence: 'CC0',
    link: 'https://www.wikipathways.org/pathways/WP364',
  },
];
