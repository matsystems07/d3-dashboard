// script.js
// Single-file D3 dashboard for two tabs (Summary + IMDB exploration).
// EXPECTED CSV columns (from your paste):
// show_id,type,title,director,cast,country,date_added,release_year,rating,duration,listed_in,description,IMDB_numvotes,IMDB_rating

const DATA_PATH = "data/preprocessed.csv"; // <-- put your 3.3MB CSV here

// GLOBAL FILTERS & state
const state = {
  type: "All",
  yearMin: null,
  yearMax: null,
  imdbMin: 0,
  clickedGenre: null,
  clickedCountry: null,
  clickedTitle: null
};

// helper: parse numeric fields safely
function asNum(v){ const n = +v; return isNaN(n) ? null : n; }

// load CSV
d3.csv(DATA_PATH, d3.autoType).then(rawData => {
  // normalise column keys (trim)
  const data = rawData.map(d => {
    const clean = {};
    for (let k in d) clean[k.trim()] = d[k];
    // ensure known fields exist
    clean.release_year = asNum(clean.release_year) || asNum(clean.startYear) || null;
    clean.IMDB_rating = asNum(clean.IMDB_rating);
    clean.IMDB_numvotes = asNum(clean.IMDB_numvotes);
    clean.country = (clean.country || "Unknown").toString();
    clean.listed_in = (clean.listed_in || "Unknown").toString();
    clean.description = (clean.description || "").toString();
    return clean;
  });

  // initialize year min/max from data
  const yrs = data.map(d=>d.release_year).filter(Boolean);
  state.yearMin = d3.min(yrs);
  state.yearMax = d3.max(yrs);

  // wire up filter UI
  d3.select("#filter-type").on("change", function(){ state.type = this.value; renderAll(); });
  d3.select("#year-min").property("value", state.yearMin).on("input", function(){ state.yearMin = +this.value; renderAll();});
  d3.select("#year-max").property("value", state.yearMax).on("input", function(){ state.yearMax = +this.value; renderAll();});
  d3.select("#imdb-min").property("value", state.imdbMin).on("input", function(){ state.imdbMin = +this.value; renderAll();});
  d3.select("#reset").on("click", ()=>{
    state.type = "All"; state.clickedGenre=null; state.clickedCountry=null; state.clickedTitle=null;
    state.yearMin = d3.min(yrs); state.yearMax = d3.max(yrs); state.imdbMin = 0;
    d3.select("#filter-type").property("value", state.type);
    d3.select("#year-min").property("value", state.yearMin);
    d3.select("#year-max").property("value", state.yearMax);
    d3.select("#imdb-min").property("value", state.imdbMin);
    renderAll();
  });

  // tabs
  d3.select("#tab-summary").on("click", ()=>{ showTab("summary"); });
  d3.select("#tab-imdb").on("click", ()=>{ showTab("imdb"); });

  // initial render
  renderAll();

  // ------------- functions -------------
  function filtered() {
    return data.filter(d=>{
      if (state.type !== "All" && d.type !== state.type) return false;
      if (state.yearMin && d.release_year && d.release_year < state.yearMin) return false;
      if (state.yearMax && d.release_year && d.release_year > state.yearMax) return false;
      if (d.IMDB_rating != null && d.IMDB_rating < state.imdbMin) return false;
      if (state.clickedGenre) {
        const genres = (d.listed_in || "").toLowerCase();
        if (!genres.includes(state.clickedGenre.toLowerCase())) return false;
      }
      if (state.clickedCountry) {
        if (!d.country || !d.country.toLowerCase().includes(state.clickedCountry.toLowerCase())) return false;
      }
      if (state.clickedTitle) {
        if (!d.title || d.title !== state.clickedTitle) return false;
      }
      return true;
    });
  }

  function renderAll(){
    const f = filtered();
    renderKPIs(f);
    renderLine(f);
    renderRatingBars(f);
    renderCountryBars(f);
    renderGenreTreemap(f);
    renderImdbBar(f);
    renderWordFreq(f);
    renderTable(f);
  }

  // ---------------- KPIs ----------------
  function renderKPIs(dataset){
    const avg = d3.mean(dataset, d => d.IMDB_rating) || 0;
    const votes = d3.sum(dataset, d => d.IMDB_numvotes) || 0;
    const count = dataset.length;
    d3.select("#kpi-imdb").text((+avg).toFixed(2));
    d3.select("#kpi-votes").text(d3.format(",")(Math.round(votes)));
    d3.select("#kpi-count").text(count);
  }

  // ---------------- Line: Titles per year ---------------
  function renderLine(dataset){
    const el = d3.select("#chart-line"); el.selectAll("*").remove();
    const margin = {t:10, r:10, b:30, l:40}, w = el.node().clientWidth, h = 260;
    const svg = el.append("svg").attr("width", w).attr("height", h);
    const counts = d3.rollup(dataset, v=>v.length, d=>d.release_year);
    const arr = Array.from(counts).filter(d=>d[0]).sort((a,b)=>a[0]-b[0]);
    if (arr.length===0) { svg.append("text").attr("x",10).attr("y",20).text("No data"); return; }
    const x = d3.scaleLinear().domain(d3.extent(arr, d=>d[0])).range([margin.l, w-margin.r]);
    const y = d3.scaleLinear().domain([0, d3.max(arr, d=>d[1])]).range([h-margin.b, margin.t]);
    const line = d3.line().x(d=>x(d[0])).y(d=>y(d[1]));
    svg.append("path").datum(arr).attr("d", line).attr("fill","none").attr("stroke","#e31b23").attr("stroke-width",2);
    svg.append("g").selectAll("circle").data(arr).enter().append("circle")
      .attr("cx", d=>x(d[0])).attr("cy", d=>y(d[1])).attr("r",3).attr("fill","#ffdede")
      .on("click", d=>{ state.yearMin = d[0]; state.yearMax = d[0]; d3.select("#year-min").property("value", state.yearMin); d3.select("#year-max").property("value", state.yearMax); renderAll(); showTab("imdb"); });
    // axes
    svg.append("g").attr("transform", `translate(0,${h-margin.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));
    svg.append("g").attr("transform", `translate(${margin.l},0)`).call(d3.axisLeft(y).ticks(4));
  }

  // ---------------- Rating category bar chart ----------------
  function renderRatingBars(dataset){
    const el = d3.select("#chart-rating"); el.selectAll("*").remove();
    const margin = {t:10, r:8, b:40, l:70}, w = el.node().clientWidth, h = 260;
    const svg = el.append("svg").attr("width", w).attr("height", h);
    const grouping = d3.rollup(dataset, v=>v.length, d => d.rating || "Unknown");
    const arr = Array.from(grouping).sort((a,b)=>b[1]-a[1]);
    const y = d3.scaleBand().domain(arr.map(d=>d[0])).range([margin.t, h-margin.b]).padding(0.2);
    const x = d3.scaleLinear().domain([0, d3.max(arr, d=>d[1])||1]).range([margin.l, w-margin.r]);
    svg.append("g").selectAll("rect").data(arr).enter().append("rect")
      .attr("x", margin.l).attr("y", d=>y(d[0])).attr("height", y.bandwidth())
      .attr("width", d=> x(d[1]) - margin.l).attr("fill","#e31b23")
      .on("click", d=>{ state.clickedGenre = null; state.clickedCountry = null; state.clickedTitle=null; /* rating click sets nothing for now */ renderAll(); showTab("imdb");});
    svg.append("g").attr("transform", `translate(0,${h-margin.b})`).call(d3.axisBottom(x).ticks(4));
    svg.append("g").attr("transform", `translate(${margin.l},0)`).call(d3.axisLeft(y));
  }

  // ---------------- Country bar (top 10) ----------------
  function renderCountryBars(dataset){
    const el = d3.select("#chart-country"); el.selectAll("*").remove();
    const margin = {t:10, r:8, b:40, l:110}, w = el.node().clientWidth, h = 260;
    const svg = el.append("svg").attr("width", w).attr("height", h);
    // split countries by comma and count
    const countryCounts = new Map();
    dataset.forEach(d=>{
      const c = (d.country || "Unknown").toString().split(",").map(s=>s.trim());
      c.forEach(cc => countryCounts.set(cc, (countryCounts.get(cc) || 0) + 1));
    });
    let arr = Array.from(countryCounts.entries()).map(d=>({country:d[0],count:d[1]}))
      .sort((a,b)=>b.count-a.count).slice(0,8);
    if (arr.length === 0) { svg.append("text").attr("x",10).attr("y",20).text("No data"); return; }
    const y = d3.scaleBand().domain(arr.map(d=>d.country)).range([margin.t, h-margin.b]).padding(0.2);
    const x = d3.scaleLinear().domain([0, d3.max(arr, d=>d.count)]).range([margin.l, w-margin.r]);
    svg.append("g").selectAll("rect").data(arr).enter().append("rect")
      .attr("x", margin.l).attr("y", d=>y(d.country)).attr("height", y.bandwidth())
      .attr("width", d=>x(d.count)-margin.l).attr("fill","#e31b23")
      .on("click", d=>{ state.clickedCountry = d.country; renderAll(); showTab("imdb"); });
    svg.append("g").attr("transform", `translate(${margin.l},0)`).call(d3.axisLeft(y));
    svg.append("g").attr("transform", `translate(0,${h-margin.b})`).call(d3.axisBottom(x).ticks(4));
  }

  // ---------------- Genre Treemap ----------------
  function renderGenreTreemap(dataset){
    const el = d3.select("#chart-genre"); el.selectAll("*").remove();
    const w = el.node().clientWidth, h = 260;
    const svg = el.append("svg").attr("width", w).attr("height", h);
    // build genre counts
    const gmap = new Map();
    dataset.forEach(d=>{
      const gs = (d.listed_in || "").split(",").map(s=>s.trim()).filter(Boolean);
      gs.forEach(g => gmap.set(g, (gmap.get(g)||0)+1));
    });
    const nodes = Array.from(gmap.entries()).map(d=>({name:d[0],value:d[1]}));
    if (nodes.length === 0) { svg.append("text").attr("x",10).attr("y",20).text("No data"); return; }
    const root = d3.hierarchy({children: nodes}).sum(d => d.value);
    d3.treemap().size([w, h]).padding(2)(root);
    const colors = d3.scaleOrdinal(d3.schemeReds[5]);
    const leaf = svg.selectAll("g").data(root.leaves()).enter().append("g").attr("transform", d=>`translate(${d.x0},${d.y0})`);
    leaf.append("rect").attr("width", d=>d.x1-d.x0).attr("height", d=>d.y1-d.y0).attr("fill", (d,i)=>colors(i)).attr("stroke","#111")
      .on("click", d=>{ state.clickedGenre = d.data.name; renderAll(); showTab("imdb"); });
    leaf.append("text").attr("x",4).attr("y",14).text(d=>d.data.name).attr("font-size",11).attr("fill","#fff");
  }

  // ---------------- IMDB average by type ----------------
  function renderImdbBar(dataset){
    const el = d3.select("#chart-imdb-bar"); el.selectAll("*").remove();
    const margin = {t:10, r:10, b:30, l:70}, w = el.node().clientWidth, h = 220;
    const svg = el.append("svg").attr("width", w).attr("height", h);
    const grouping = d3.rollups(dataset, v=>d3.mean(v, d=>d.IMDB_rating), d=>d.type);
    const arr = grouping.map(d=>({type:d[0], avg:d[1] || 0})).sort((a,b)=>b.avg-a.avg);
    const x = d3.scaleLinear().domain([0,10]).range([margin.l, w-margin.r]);
    const y = d3.scaleBand().domain(arr.map(d=>d.type)).range([margin.t, h-margin.b]).padding(0.3);
    svg.selectAll("rect").data(arr).enter().append("rect")
      .attr("x", margin.l).attr("y", d=>y(d.type)).attr("height", y.bandwidth())
      .attr("width", d=> x(d.avg) - margin.l).attr("fill","#e31b23");
    svg.append("g").attr("transform", `translate(${margin.l},0)`).call(d3.axisLeft(y));
    svg.append("g").attr("transform", `translate(0,${h-margin.b})`).call(d3.axisBottom(x).ticks(5));
  }

  // ---------------- Word frequency (simple clickable list) ----------------
  // ---------------- Pretty Top Words Bar Chart ----------------
function renderWordFreq(dataset){
  const el = d3.select("#chart-wordcloud"); 
  el.selectAll("*").remove();

  const text = dataset.map(d => d.description || "").join(" ");
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const counts = d3.rollup(words, v => v.length, d => d);
  const arr = Array.from(counts).map(d => ({word: d[0], count: d[1]}))
               .sort((a, b) => b.count - a.count)
               .slice(0, 20);  // top 20 words

  if (arr.length === 0) { 
    el.append("text").text("No data").attr("x",10).attr("y",20); 
    return; 
  }

  const w = el.node().clientWidth;
  const h = 300;
  const margin = {t:20, r:20, b:40, l:100};
  const svg = el.append("svg").attr("width", w).attr("height", h);

  const x = d3.scaleLinear().domain([0, d3.max(arr, d => d.count)]).range([margin.l, w-margin.r]);
  const y = d3.scaleBand().domain(arr.map(d => d.word)).range([margin.t, h-margin.b]).padding(0.2);
  const color = d3.scaleSequential(d3.interpolateReds).domain([0, d3.max(arr, d => d.count)]);

  // bars
  svg.selectAll("rect").data(arr).enter().append("rect")
    .attr("x", margin.l)
    .attr("y", d => y(d.word))
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.count)-margin.l)
    .attr("fill", d=>color(d.count))
    .style("cursor","pointer")
    .on("mouseover", function(){ d3.select(this).attr("fill","#ff6666"); })
    .on("mouseout", function(d){ d3.select(this).attr("fill", color(d.count)); })
    .on("click", d=>{
      state.clickedGenre = d.word; 
      renderAll(); 
      showTab("imdb"); 
    });

  // counts on bars
  svg.selectAll("text.count").data(arr).enter().append("text")
    .attr("class","count")
    .attr("x", d=>x(d.count)+5)
    .attr("y", d=>y(d.word)+y.bandwidth()/2+4)
    .text(d=>d.count)
    .attr("fill","#333")
    .attr("font-size",12);

  // axes
  svg.append("g").attr("transform", `translate(${margin.l},0)`).call(d3.axisLeft(y));
  svg.append("g").attr("transform", `translate(0,${h-margin.b})`).call(d3.axisBottom(x).ticks(5));
}


  // ---------------- Table of top IMDB titles ----------------
  function renderTable(dataset){
    const wrap = d3.select("#table-wrap"); wrap.selectAll("*").remove();
    const table = wrap.append("table");
    const thead = table.append("thead").append("tr");
    ["Title","Type","Year","IMDB","Votes","Genres"].forEach(h=> thead.append("th").text(h));
    const tbody = table.append("tbody");
    const rows = dataset.filter(d => d.IMDB_rating != null).sort((a,b)=>b.IMDB_rating - a.IMDB_rating).slice(0,200);
    const tr = tbody.selectAll("tr").data(rows).enter().append("tr")
      .on("click", d=>{ state.clickedTitle = d.title; renderAll(); });
    tr.append("td").text(d=>d.title);
    tr.append("td").text(d=>d.type);
    tr.append("td").text(d=>d.release_year||"");
    tr.append("td").text(d=>d.IMDB_rating==null? "": d.IMDB_rating.toFixed(1));
    tr.append("td").text(d=>d.IMDB_numvotes? d3.format(",")(Math.round(d.IMDB_numvotes)): "");
    tr.append("td").text(d=>d.listed_in);
  }

  // ---------------- Tab UI ----------------
  function showTab(name){
    if (name === "summary"){
      d3.select("#summary").style("display", null);
      d3.select("#imdb").style("display", "none");
      d3.select("#tab-summary").classed("active", true);
      d3.select("#tab-imdb").classed("active", false);
    } else {
      d3.select("#summary").style("display", "none");
      d3.select("#imdb").style("display", null);
      d3.select("#tab-summary").classed("active", false);
      d3.select("#tab-imdb").classed("active", true);
    }
    // re-render to fit sizes
    renderAll();
  }

}); // end CSV load
