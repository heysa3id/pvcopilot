import { useEffect, useState } from "react"
import {
  PopoverForm,
  PopoverFormButton,
  PopoverFormCutOutLeftIcon,
  PopoverFormCutOutRightIcon,
  PopoverFormSeparator,
  PopoverFormSuccess,
} from "@/components/ui/popover-form"

type FormState = "idle" | "loading" | "success"

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001"

export default function ContactFormPopover({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const [formState, setFormState] = useState<FormState>("idle")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  async function submit() {
    setFormState("loading")
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      })
      if (!res.ok) throw new Error("Request failed")
      setFormState("success")
      setTimeout(() => {
        setOpen(false)
        setFormState("idle")
        setName("")
        setEmail("")
        setMessage("")
      }, 1800)
    } catch (err) {
      console.error("Contact form error:", err)
      setFormState("idle")
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setOpen])

  return (
    <PopoverForm
      title="Contact us"
      open={open}
      setOpen={setOpen}
      width="364px"
      height="372px"
      showCloseButton={formState !== "success"}
      showSuccess={formState === "success"}
      hideTrigger
      openChild={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name || !email || !message) return
            submit()
          }}
          className="space-y-4"
        >
          <div className="px-4 pt-4">
            <label
              htmlFor="contact-name"
              className="mb-1 block text-sm font-medium text-gray-500"
            >
              Name
            </label>
            <input
              type="text"
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-amber-400"
              required
            />
          </div>
          <div className="px-4">
            <label
              htmlFor="contact-email"
              className="mb-1 block text-sm font-medium text-gray-500"
            >
              Email
            </label>
            <input
              type="email"
              id="contact-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity("Please include a correct email address")}
              onInput={(e) => (e.target as HTMLInputElement).setCustomValidity("")}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-amber-400"
              required
            />
          </div>
          <div className="px-4">
            <label
              htmlFor="contact-message"
              className="mb-1 block text-sm font-medium text-gray-500"
            >
              Message
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-amber-400"
              rows={3}
              required
            />
          </div>
          <div className="relative flex h-12 items-center px-[10px]">
            <PopoverFormSeparator />
            <div className="absolute left-0 top-0 -translate-x-[1.5px] -translate-y-1/2">
              <PopoverFormCutOutLeftIcon />
            </div>
            <div className="absolute right-0 top-0 translate-x-[1.5px] -translate-y-1/2 rotate-180">
              <PopoverFormCutOutRightIcon />
            </div>
            <PopoverFormButton
              loading={formState === "loading"}
              text="Send message"
            />
          </div>
        </form>
      }
      successChild={
        <PopoverFormSuccess
          title="Message Sent"
          description="Thank you for contacting us. We'll get back to you soon!"
        />
      }
    />
  )
}
