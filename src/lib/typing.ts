import { request } from "./api/client";

// The client blocks movement keys while a text field has focus, so pages report focus moving into and out of one
export const isTextField = (node: EventTarget | null) =>
  node instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(node.type);

export function reportTyping(typing: boolean) {
  request("POST", "/typing", { body: { typing } }).catch(() => {});
}

/** focusin and focusout handlers for a screen's root element. */
export const typingFocus = {
  onfocusin: (event: FocusEvent) => {
    if (isTextField(event.target)) reportTyping(true);
  },
  onfocusout: (event: FocusEvent) => {
    if (isTextField(event.target) && !isTextField(event.relatedTarget)) reportTyping(false);
  },
};
