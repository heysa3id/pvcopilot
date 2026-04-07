import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

export function GoogleAnalytics() {
  const location = useLocation()

  useEffect(() => {
    if (!GA_ID) return

    window.dataLayer = window.dataLayer || []
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments)
      }
    }

    const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
    if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
      window.gtag('js', new Date())
      window.gtag('config', GA_ID)
      const script = document.createElement('script')
      script.async = true
      script.src = scriptSrc
      document.head.appendChild(script)
    }
  }, [])

  useEffect(() => {
    if (!GA_ID || typeof window.gtag !== 'function') return
    window.gtag('config', GA_ID, {
      page_path: location.pathname + location.search,
    })
  }, [location.pathname, location.search])

  return null
}
