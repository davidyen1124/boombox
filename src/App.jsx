import { useRef, useEffect, useState } from 'react'
import './App.css'

const BOOMBOX_W = 800
const BOOMBOX_H = 300

function generateRandomDuration() {
  return Math.floor(Math.random() * (180 - 120 + 1)) + 120
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function App() {
  const canvasRef = useRef(null)
  const reqIdRef = useRef(0)
  const gainNodeRef = useRef(null)
  const barsRef = useRef([0, 0, 0, 0, 0, 0, 0])
  const rotationRef = useRef(0)

  const [width, setWidth] = useState(window.innerWidth)
  const [height, setHeight] = useState(window.innerHeight)
  const micEnabledRef = useRef(false)

  const [trackNumber, setTrackNumber] = useState(1)
  const [trackTime, setTrackTime] = useState(0)
  const [trackDuration, setTrackDuration] = useState(generateRandomDuration())

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth)
      setHeight(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTrackTime((prevTime) => {
        const newTime = prevTime + 1
        if (newTime >= trackDuration) {
          setTrackNumber((prevTrack) => prevTrack + 1)
          setTrackDuration(generateRandomDuration())
          return 0
        }
        return newTime
      })
    }, 1000)
    return () => clearInterval(intervalId)
  }, [trackDuration])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 128
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    async function setupMicrophoneAudio(audioContext, analyser) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        })
        const source = audioContext.createMediaStreamSource(stream)
        // Create a GainNode with an initial neutral gain value
        const gainNode = audioContext.createGain()
        gainNode.gain.value = 1
        gainNodeRef.current = gainNode
        // Connect the source to the GainNode, then to the analyser
        source.connect(gainNode)
        gainNode.connect(analyser)
        return true
      } catch (err) {
        console.error('Microphone access denied or not available:', err)
        return false
      }
    }

    setupMicrophoneAudio(audioContext, analyser).then((result) => {
      micEnabledRef.current = result
    })

    function animate() {
      const attackFactor = 0.3 // Fast rise when target > current value
      const decayFactor = 0.1 // Slow fall when target < current value

      if (micEnabledRef.current) {
        analyser.getByteFrequencyData(dataArray)

        // Dynamic Automatic Gain Control (AGC)
        if (gainNodeRef.current) {
          const maxAmplitude = Math.max(...dataArray)
          const targetAmplitude = 150 // Desired target amplitude
          const computedGain = maxAmplitude
            ? targetAmplitude / maxAmplitude
            : gainNodeRef.current.gain.value
          const smoothingFactor = 0.05
          const newGain =
            gainNodeRef.current.gain.value +
            smoothingFactor * (computedGain - gainNodeRef.current.gain.value)
          gainNodeRef.current.gain.value = Math.min(newGain, 10)
        }

        const targetBars = getAverageBars(Array.from(dataArray), 7)
        barsRef.current = barsRef.current.map((prev, i) =>
          interpolateValue(prev, targetBars[i], attackFactor, decayFactor)
        )
      } else {
        const randomTargets = barsRef.current.map((v) => {
          const change = (Math.random() - 0.5) * 10
          let targetVal = v + change
          return Math.max(0, Math.min(targetVal, 100))
        })
        barsRef.current = barsRef.current.map((prev, i) =>
          interpolateValue(prev, randomTargets[i], attackFactor, decayFactor)
        )
      }

      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const left = cx - BOOMBOX_W / 2
      const top = cy - BOOMBOX_H / 2

      // Draw boombox base background
      drawBoomboxBase(ctx, left, top)

      // Draw the two knobs in place of the original speakers and gain indicator.
      const currentGain = gainNodeRef.current
        ? gainNodeRef.current.gain.value
        : 1
      drawMicKnob(ctx, left + 140, top + 150, 80, micEnabledRef.current)
      drawGainKnob(ctx, left + 660, top + 150, 80, currentGain, rotationRef)

      // Draw display area (background, text, and frequency bars) with new layout.
      drawDisplayBackground(ctx, left + 250, top + 50, 300, 200)
      drawDisplayText(ctx, left, top, trackTime, trackNumber)
      drawFrequencyBars(ctx, left, top, barsRef.current)

      reqIdRef.current = requestAnimationFrame(animate)
    }
    reqIdRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(reqIdRef.current)
      audioContext.close()
    }
  }, [width, height, trackTime, trackNumber])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className='boombox-canvas'
    />
  )
}

function interpolateValue(
  current,
  target,
  attackFactor = 0.3,
  decayFactor = 0.1
) {
  const factor = target > current ? attackFactor : decayFactor
  return current + (target - current) * factor
}

function drawBoomboxBase(ctx, x, y) {
  ctx.save()
  const w = BOOMBOX_W
  const h = BOOMBOX_H

  // Enhanced drop shadow for more dramatic floating effect
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 15

  // Main body gradient with enhanced metallic effect
  const mainGrad = ctx.createLinearGradient(x, y, x, y + h)
  mainGrad.addColorStop(0, '#555')
  mainGrad.addColorStop(0.2, '#333')
  mainGrad.addColorStop(0.4, '#2a2a2a')
  mainGrad.addColorStop(0.6, '#222')
  mainGrad.addColorStop(0.8, '#1a1a1a')
  mainGrad.addColorStop(1, '#111')

  // Draw main body with more pronounced rounded corners
  ctx.fillStyle = mainGrad
  const radius = 15
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fill()

  // Reset shadow for other elements
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Enhanced top edge highlight
  const topEdgeGrad = ctx.createLinearGradient(x, y, x, y + 30)
  topEdgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
  topEdgeGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)')
  topEdgeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = topEdgeGrad
  ctx.fillRect(x, y, w, 30)

  // Enhanced bottom edge shadow
  const bottomEdgeGrad = ctx.createLinearGradient(x, y + h - 30, x, y + h)
  bottomEdgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  bottomEdgeGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)')
  bottomEdgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)')
  ctx.fillStyle = bottomEdgeGrad
  ctx.fillRect(x, y + h - 30, w, 30)

  // Enhanced metallic texture with multiple layers
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'

  // First metallic layer - vertical brushed metal effect
  const metalGrad1 = ctx.createLinearGradient(x, y, x, y + h)
  metalGrad1.addColorStop(0, 'rgba(255, 255, 255, 0.1)')
  metalGrad1.addColorStop(0.2, 'rgba(255, 255, 255, 0)')
  metalGrad1.addColorStop(0.4, 'rgba(255, 255, 255, 0.1)')
  metalGrad1.addColorStop(0.6, 'rgba(255, 255, 255, 0)')
  metalGrad1.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)')
  metalGrad1.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = metalGrad1
  ctx.fillRect(x, y, w, h)

  // Second metallic layer - diagonal highlight
  const metalGrad2 = ctx.createLinearGradient(x, y, x + w, y + h)
  metalGrad2.addColorStop(0, 'rgba(255, 255, 255, 0)')
  metalGrad2.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)')
  metalGrad2.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)')
  metalGrad2.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)')
  metalGrad2.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = metalGrad2
  ctx.fillRect(x, y, w, h)
  ctx.restore()

  // Add top panel separator line with enhanced depth
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 10, y + 40)
  ctx.lineTo(x + w - 10, y + 40)
  ctx.stroke()

  // Add subtle shadow under the separator line
  const lineShadowGrad = ctx.createLinearGradient(x, y + 40, x, y + 45)
  lineShadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.3)')
  lineShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = lineShadowGrad
  ctx.fillRect(x + 10, y + 40, w - 20, 5)

  ctx.restore()
}

function drawDisplayBackground(ctx, x, y, w, h) {
  ctx.save()

  // Enhanced outer shadow for more depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
  ctx.shadowBlur = 15
  ctx.shadowOffsetY = 3

  // Main display background with enhanced depth gradient
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, '#222')
  grad.addColorStop(0.3, '#1a1a1a')
  grad.addColorStop(0.7, '#151515')
  grad.addColorStop(1, '#111')

  // Draw deeply inset display
  ctx.fillStyle = grad
  const radius = 5
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fill()

  // Reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Enhanced inner shadow at the top
  const innerShadowGrad = ctx.createLinearGradient(x, y, x, y + 20)
  innerShadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
  innerShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = innerShadowGrad
  ctx.fillRect(x, y, w, 20)

  // Add inner shadow at the bottom
  const bottomShadowGrad = ctx.createLinearGradient(x, y + h - 20, x, y + h)
  bottomShadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  bottomShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)')
  ctx.fillStyle = bottomShadowGrad
  ctx.fillRect(x, y + h - 20, w, 20)

  // Enhanced glass effect with multiple layers
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'

  // First glass layer - vertical gradient
  const glassGrad = ctx.createLinearGradient(x, y, x, y + h)
  glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.07)')
  glassGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.02)')
  glassGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.01)')
  glassGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.02)')
  glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.07)')
  ctx.fillStyle = glassGrad
  ctx.fillRect(x, y, w, h)

  // Second glass layer - diagonal highlight
  const highlightGrad = ctx.createLinearGradient(x, y, x + w, y + h / 2)
  highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0)')
  highlightGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.03)')
  highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.07)')
  highlightGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.03)')
  highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = highlightGrad
  ctx.fillRect(x, y, w, h)
  ctx.restore()

  // Add subtle border with depth effect
  ctx.lineWidth = 3
  const borderGrad = ctx.createLinearGradient(x, y, x, y + h)
  borderGrad.addColorStop(0, '#666')
  borderGrad.addColorStop(0.5, '#444')
  borderGrad.addColorStop(1, '#333')
  ctx.strokeStyle = borderGrad
  ctx.strokeRect(x, y, w, h)

  ctx.restore()
}

function drawDisplayText(ctx, left, top, trackTime, trackNumber) {
  const displayX = left + 250
  const displayY = top + 50
  const padding = 20
  const contentX = displayX + padding
  const contentY = displayY + padding

  ctx.save()
  ctx.font = "28px 'Orbitron', sans-serif"
  ctx.fillStyle = '#0f0'
  ctx.shadowColor = '#0f0'
  ctx.shadowBlur = 10
  ctx.fillText(formatTime(trackTime), contentX, contentY + 18)
  ctx.fillText(`TRACK ${trackNumber}`, contentX, contentY + 58)
  ctx.restore()
}

function drawFrequencyBars(ctx, left, top, bars) {
  const displayX = left + 250
  const displayY = top + 50
  const padding = 20
  const contentX = displayX + padding
  const contentW = 300 - 2 * padding
  const baseY = displayY + 200 - padding - 10 // Moved up slightly to ensure bars stay in box

  const space = 3 // Reduced space between bars
  const numBars = bars.length
  const barWidth = (contentW - (numBars - 1) * space) / numBars
  const maxH = 60 // Reduced max height to fit in display

  ctx.save()

  // Create a clipping region for the bars
  ctx.beginPath()
  ctx.rect(displayX + padding, displayY + padding, contentW, 200 - 2 * padding)
  ctx.clip()

  bars.forEach((v, i) => {
    const h = (v / 100) * maxH
    const x = contentX + i * (barWidth + space)
    const y = baseY - h

    // Draw bar shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1

    // Create 3D effect with multiple gradients
    // Front face gradient
    const frontGrad = ctx.createLinearGradient(x, y, x, baseY)
    frontGrad.addColorStop(0, '#ffff00')
    frontGrad.addColorStop(0.5, '#ffcc00')
    frontGrad.addColorStop(1, '#ff8800')

    // Side face gradient (right side)
    const sideGrad = ctx.createLinearGradient(
      x + barWidth,
      y,
      x + barWidth,
      baseY
    )
    sideGrad.addColorStop(0, '#cc9900')
    sideGrad.addColorStop(0.5, '#996600')
    sideGrad.addColorStop(1, '#663300')

    // Draw main bar (front face)
    ctx.fillStyle = frontGrad
    ctx.fillRect(x, y, barWidth - 1, h)

    // Draw side face (3D effect)
    ctx.fillStyle = sideGrad
    ctx.fillRect(x + barWidth - 1, y, 1, h)

    // Add highlight on top of the bar
    const highlightGrad = ctx.createLinearGradient(x, y, x + barWidth, y)
    highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)')
    highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)')
    highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = highlightGrad
    ctx.fillRect(x, y, barWidth, 2)

    // Add reflection (smaller and more subtle)
    ctx.save()
    ctx.globalAlpha = 0.1
    const reflectionGrad = ctx.createLinearGradient(
      x,
      baseY + 1,
      x,
      baseY + h * 0.2
    )
    reflectionGrad.addColorStop(0, '#ff8800')
    reflectionGrad.addColorStop(1, 'rgba(255, 136, 0, 0)')
    ctx.fillStyle = reflectionGrad
    ctx.fillRect(x, baseY + 1, barWidth - 1, h * 0.2)
    ctx.restore()
  })

  ctx.restore()
}

function getAverageBars(dataArray, numBars) {
  const binSize = Math.floor(dataArray.length / numBars)
  let averages = []
  for (let i = 0; i < numBars; i++) {
    const start = i * binSize
    const end = start + binSize
    const binData = dataArray.slice(start, end)
    const sum = binData.reduce((acc, val) => acc + val, 0)
    const avg = sum / binData.length
    averages.push((avg / 255) * 100)
  }
  return averages
}

function drawMicKnob(ctx, cx, cy, r, micEnabled) {
  // Draw the knob base (outer circle, inner circle, and highlight)
  ctx.save()
  const g1 = ctx.createRadialGradient(
    cx - r * 0.2,
    cy - r * 0.2,
    r * 0.2,
    cx,
    cy,
    r
  )
  g1.addColorStop(0, '#555')
  g1.addColorStop(1, '#101010')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g1
  ctx.fill()

  const ir = r * 0.65
  const g2 = ctx.createRadialGradient(cx, cy, ir * 0.1, cx, cy, ir)
  g2.addColorStop(0, '#666')
  g2.addColorStop(1, '#222')
  ctx.beginPath()
  ctx.arc(cx, cy, ir, 0, Math.PI * 2)
  ctx.fillStyle = g2
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fill()
  ctx.restore()

  // Calculate the rotation angle using the same range as gain knob
  const rotationDeg = micEnabled ? 135 : -135
  const rotationRad = (rotationDeg * Math.PI) / 180

  // Draw the pointer from the center.
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotationRad)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -r + 10) // pointer from center upward, then rotated
  ctx.lineWidth = 4
  ctx.strokeStyle = '#0f0'
  ctx.stroke()
  ctx.restore()

  // Draw the label below the knob with extra gap.
  ctx.save()
  ctx.font = "16px 'Orbitron', sans-serif"
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText(micEnabled ? 'MIC: ON' : 'MIC: OFF', cx, cy + r + 30)
  ctx.restore()
}

function drawGainKnob(ctx, cx, cy, r, gainValue, rotationRef) {
  // Draw the knob base (outer circle, inner circle, and little highlight)
  ctx.save()
  const outerGradient = ctx.createRadialGradient(
    cx - r * 0.2,
    cy - r * 0.2,
    r * 0.2,
    cx,
    cy,
    r
  )
  outerGradient.addColorStop(0, '#555')
  outerGradient.addColorStop(1, '#101010')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = outerGradient
  ctx.fill()

  const innerR = r * 0.65
  const innerGradient = ctx.createRadialGradient(
    cx,
    cy,
    innerR * 0.1,
    cx,
    cy,
    innerR
  )
  innerGradient.addColorStop(0, '#666')
  innerGradient.addColorStop(1, '#222')
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fillStyle = innerGradient
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fill()
  ctx.restore()

  // Clamp gainValue to [0, 10]
  const clampedGain = Math.max(0, Math.min(gainValue, 10))

  // Map gain value (0-10) to a limited angular range
  const minAngle = -135 // pointer at gain=0
  const maxAngle = 135 // pointer at gain=10
  const targetAngle = (clampedGain / 10) * (maxAngle - minAngle) + minAngle

  // Smoothly update the pointer rotation
  rotationRef.current = interpolateValue(
    rotationRef.current,
    targetAngle,
    0.3,
    0.1
  )

  // Draw the pointer with the interpolated rotation
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotationRef.current * Math.PI) / 180)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -r + 10)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#0f0'
  ctx.stroke()
  ctx.restore()

  // Draw the dynamic gain label below the knob
  ctx.save()
  ctx.font = "16px 'Orbitron', sans-serif"
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText(`GAIN: ${gainValue.toFixed(1)}`, cx, cy + r + 30)

  // Draw static range labels
  const textRadius = r - 20
  const angleForRightLabel = (45 * Math.PI) / 180 // 90° for "10" label
  const angleForLeftLabel = (-225 * Math.PI) / 180 // -90° for "0" label

  const rightLabelX = cx + textRadius * Math.cos(angleForRightLabel)
  const rightLabelY = cy + textRadius * Math.sin(angleForRightLabel)
  const leftLabelX = cx + textRadius * Math.cos(angleForLeftLabel)
  const leftLabelY = cy + textRadius * Math.sin(angleForLeftLabel)

  ctx.fillText('10', rightLabelX, rightLabelY)
  ctx.fillText('0', leftLabelX, leftLabelY)
  ctx.restore()
}
