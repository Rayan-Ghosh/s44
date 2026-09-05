"use client"

import * as React from "react"

export const APK_DOWNLOAD_URL =
  "https://github.com/Rayan-Ghosh/SOA-IDEATHON-S40/releases/download/v1.0.0/AVARAN.apk"

export function QrDownloadCard() {
  return (
    <aside
      className="qr-card-wrapper"
      aria-label="Download AVARAN mobile application"
    >
      <a
        href={APK_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="qr-card"
        aria-label="Download AVARAN app APK"
      >
        <div className="qr-card-code">
          <img
            src="/images/avaran-qr.jpg"
            alt="Download AVARAN app"
            width={58}
            height={58}
            className="qr-card-img"
          />
        </div>
        <div className="qr-card-info">
          <span className="qr-card-kicker">download</span>
          <span className="qr-card-title">AVARAN</span>
        </div>
      </a>
    </aside>
  )
}
