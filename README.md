# Netflix / IMDB D3 Dashboard

This is a **static D3.js dashboard** for exploring Netflix shows and movies with IMDB ratings.  

It includes:

- KPIs: average IMDB, total votes, total titles
- Line chart: titles per year
- Rating category bar chart
- Country bar chart (top countries)
- Genre treemap
- IMDB rating by type
- Top word frequency bar chart (clickable to filter)
- Table of top IMDB titles

## Deployment

This is a **static site**. To deploy on Render:

1. Create a **Static Site**.
2. Connect your GitHub repository.
3. **Publish Directory:** `/` (root)
4. **Build Command:** leave empty (not needed)
5. Deploy → Render will serve your `index.html` automatically.

## Usage

- Open the live Render URL in a browser.
- Interact with filters, charts, and tables.

## Data

- Place your CSV at `data/preprocessed.csv`
- Expected columns:

