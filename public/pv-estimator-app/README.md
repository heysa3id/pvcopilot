# PV Layout Estimator

Web app for early-stage PV concept sizing:

- map-based site selection with a drawn installation rectangle
- direct weather fetch from PVGIS TMY or Open-Meteo ERA5
- manual module, row-spacing, thermal, loss, and degradation inputs
- installed DC/AC capacity calculation
- representative-year replay into a 25-year production forecast

## Run locally

From the workspace root:

```bash
node pv-estimator-app/server.js
```

Then open:

```text
http://localhost:4173/pv-estimator-app/
```

## Notes

- The app uses a tiny local Node server to proxy weather API requests.
- PVGIS is the recommended source because it is free and no-key, but its official API blocks direct browser AJAX requests, so the local proxy is required.
- Open-Meteo provides global ERA5 reanalysis data (historical year, not a synthesized TMY). Free and no API key required.
- It uses public documentation patterns from PVsyst, PV*SOL, and PlantPredict/Terabase as modeling anchors, but it is not a replacement for those full simulation engines.
- If the map tiles do not load, the manual latitude, longitude, width, and depth inputs still work.
