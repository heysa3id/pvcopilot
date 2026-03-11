const fields = {
  projectName: 'Utility PV Project',
  capacityMW: 5,
  annualProductionMWh: 9500,
  degradationPct: 0.5,
  capexPerWp: 0.62,
  fixedOpexPerkWYear: 14,
  variableOpexPerMWh: 1.2,
  projectLifeYears: 25,
  discountRatePct: 8,
  debtRatioPct: 70,
  debtInterestPct: 5.5,
  tariffPerMWh: 72,
  taxRatePct: 20
}

const eyeIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>`

const eyeOffIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.77 21.77 0 0 1 5.06-7.94"></path>
  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.22 4.94"></path>
  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
  <path d="M1 1l22 22"></path>
</svg>`

function value(id) {
  const element = document.getElementById(id)
  if (!element) return 0
  return element.type === 'text' ? element.value : Number(element.value)
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

function npv(rate, cashflows) {
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0)
}

function irr(cashflows, guess = 0.1) {
  let rate = guess
  for (let i = 0; i < 200; i += 1) {
    const valueAtRate = npv(rate, cashflows)
    const derivative = cashflows.reduce((acc, cf, t) => {
      if (t === 0) return acc
      return acc + (-t * cf) / Math.pow(1 + rate, t + 1)
    }, 0)
    if (Math.abs(derivative) < 1e-10) break
    const next = rate - valueAtRate / derivative
    if (Math.abs(next - rate) < 1e-8) return next
    rate = next
  }
  return rate
}

function calculate() {
  const values = Object.fromEntries(Object.keys(fields).map((key) => [key, value(key)]))

  const capex = values.capacityMW * 1000000 * values.capexPerWp
  const fixedOpex = values.capacityMW * 1000 * values.fixedOpexPerkWYear
  const variableOpex = values.annualProductionMWh * values.variableOpexPerMWh
  const annualOpex = fixedOpex + variableOpex
  const revenue = values.annualProductionMWh * values.tariffPerMWh
  const preTaxCashflow = revenue - annualOpex
  const postTaxCashflow = preTaxCashflow * (1 - values.taxRatePct / 100)
  const loadFactor = (values.annualProductionMWh / (values.capacityMW * 8760)) * 100

  let discountedEnergy = 0
  let discountedCost = capex
  const cashflows = [-capex]

  for (let year = 1; year <= values.projectLifeYears; year += 1) {
    const degradedEnergy = values.annualProductionMWh * Math.pow(1 - values.degradationPct / 100, year - 1)
    const discountFactor = Math.pow(1 + values.discountRatePct / 100, year)
    discountedEnergy += degradedEnergy / discountFactor
    discountedCost += annualOpex / discountFactor
    cashflows.push(postTaxCashflow)
  }

  const lcoe = discountedCost / discountedEnergy
  const simplePayback = capex / Math.max(preTaxCashflow, 1)
  const tri = irr(cashflows) * 100

  renderResults([
    ['Total CAPEX', `$${formatNumber(capex)}`],
    ['Annual OPEX', `$${formatNumber(annualOpex)}`],
    ['Load factor', `${formatNumber(loadFactor)}%`],
    ['LCOE', `$${formatNumber(lcoe)}/MWh`],
    ['Simple TRI / payback', `${formatNumber(simplePayback)} years`],
    ['Project TRI / IRR', `${formatNumber(tri)}%`]
  ])

  renderSummary([
    ['Project', values.projectName],
    ['Installed capacity', `${formatNumber(values.capacityMW)} MW`],
    ['Annual production', `${formatNumber(values.annualProductionMWh)} MWh`],
    ['Degradation', `${formatNumber(values.degradationPct)}%`],
    ['CAPEX', `${formatNumber(values.capexPerWp)} USD/Wp`],
    ['Fixed OPEX', `${formatNumber(values.fixedOpexPerkWYear)} USD/kW/year`],
    ['Variable OPEX', `${formatNumber(values.variableOpexPerMWh)} USD/MWh`],
    ['Project life', `${formatNumber(values.projectLifeYears, 0)} years`],
    ['Discount rate', `${formatNumber(values.discountRatePct)}%`],
    ['Debt ratio', `${formatNumber(values.debtRatioPct)}%`],
    ['Debt interest', `${formatNumber(values.debtInterestPct)}%`],
    ['Tariff', `${formatNumber(values.tariffPerMWh)} USD/MWh`],
    ['Tax rate', `${formatNumber(values.taxRatePct)}%`]
  ])
}

function renderResults(rows) {
  const container = document.getElementById('results')
  container.innerHTML = rows.map(([label, val]) => `<div><span>${label}</span><strong>${val}</strong></div>`).join('')
}

function renderSummary(rows) {
  const container = document.getElementById('summary')
  container.innerHTML = rows.map(([label, val]) => `<div><span>${label}</span><strong>${val}</strong></div>`).join('')
}

function initToggles() {
  document.querySelectorAll('[data-toggle]').forEach((button) => {
    const sectionKey = button.getAttribute('data-toggle')
    const section = document.querySelector(`[data-section="${sectionKey}"]`)
    button.innerHTML = eyeIcon
    button.addEventListener('click', () => {
      section.classList.toggle('section-hidden')
      button.innerHTML = section.classList.contains('section-hidden') ? eyeOffIcon : eyeIcon
    })
  })
}

function initInputs() {
  Object.keys(fields).forEach((key) => {
    const element = document.getElementById(key)
    element.addEventListener('input', calculate)
  })
}

initToggles()
initInputs()
calculate()
