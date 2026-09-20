import { useState, useCallback } from "react"
import { getFileServerOrigin } from "./mediaUrl"

export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0) // 0–100
  const [error, setError] = useState(null)

  const upload = useCallback(async (file) => {
    setUploading(true)
    setProgress(0)
    setError(null)

    const serverBase = getFileServerOrigin()

    try {
      const url = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `${serverBase}/upload?name=${encodeURIComponent(file.name)}`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`upload failed (${xhr.status})`))
            return
          }
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.error) {
              reject(new Error(res.error))
              return
            }
            resolve(serverBase + res.url)
          } catch (e) {
            reject(e)
          }
        }

        xhr.onerror = () => reject(new Error("network error during upload"))
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
        xhr.send(file)
      })

      setProgress(100)
      return url
    } catch (err) {
      // A blob URL keeps the host canvas usable, but no phone can ever load it —
      // say so loudly rather than letting viewers sit on "waiting for host signal".
      console.warn("[useUpload] upload failed, falling back to a host-only blob URL:", err.message)
      setError("relay unreachable — this clip stays on the host, phones can't load it")
      return URL.createObjectURL(file)
    } finally {
      setUploading(false)
    }
  }, [])

  return { upload, uploading, progress, error }
}
