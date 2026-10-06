export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
}

export function addTimestampToUrl(url) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

export function getCameraImageUrl(url) {
  if (!url) return ''

  try {
    const imageUrl = new URL(url)

    if (imageUrl.hostname === 'giaothong.hochiminhcity.gov.vn' && imageUrl.port === '8007') {
      return `/camera-image/hcmc${imageUrl.pathname}${imageUrl.search}`
    }

    if (imageUrl.hostname === 'camera.thongtingiaothong.vn') {
      return `/camera-image/legacy${imageUrl.pathname}${imageUrl.search}`
    }

    if (window.location.protocol === 'https:' && imageUrl.protocol === 'http:') {
      imageUrl.protocol = 'https:'
    }

    return imageUrl.toString()
  } catch {
    return url
  }
}
