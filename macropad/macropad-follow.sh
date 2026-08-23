#!/bin/bash
# MacroPad follow-tjeneste (køres af launchd som baggrundsproces)
#
# 1) Fortæller boardet hvilken app der er forrest paa Mac'en ("app:Navn")
#    saa boardets sider automatisk foelger den aktive app.
# 2) Udfoerer kommandoer boardet sender:
#      open:AppNavn     -> open -a "AppNavn"       (elegant app-start)
#      run:GenvejsNavn  -> shortcuts run "Navn"    (Apple Genveje)
#      script:navn      -> osascript ~/.macropad/scripts/navn.applescript
#                          (AppleScript-makroer, fx Pixelmator-workflows)

while true; do
  PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | sort | tail -n 1)
  if [ -z "$PORT" ] || [ ! -w "$PORT" ]; then
    sleep 3
    continue
  fi

  stty -f "$PORT" raw 115200 2>/dev/null || { sleep 3; continue; }
  if ! exec 3<>"$PORT"; then
    sleep 3
    continue
  fi

  # Laes kommandoer fra boardet i baggrunden
  (
    while IFS= read -r line <&3; do
      line=${line%$'\r'}
      case "$line" in
        open:*) open -a "${line#open:}" ;;
        run:*)  shortcuts run "${line#run:}" >/dev/null 2>&1 & ;;
        script:*)
          navn=$(basename "${line#script:}")
          osascript "$HOME/.macropad/scripts/$navn.applescript" >/dev/null 2>&1 &
          ;;
      esac
    done
  ) &
  READER=$!

  LAST=""
  while [ -e "$PORT" ]; do
    APP=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)
    if [ -n "$APP" ] && [ "$APP" != "$LAST" ]; then
      if printf 'app:%s\n' "$APP" >&3 2>/dev/null; then
        LAST="$APP"
      else
        break
      fi
    fi
    sleep 1
  done

  kill "$READER" 2>/dev/null
  exec 3<&- 3>&-
  sleep 2
done
