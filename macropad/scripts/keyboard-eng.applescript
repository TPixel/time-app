-- Skift tastaturlayout til Engelsk via inputmenuen i menulinjen.
-- Proever flere navne, da layoutet kan hedde ABC/British/U.S./English.
-- Koeres af MacroPad'en via follow-tjenesten ("script:keyboard-eng").

tell application "System Events"
	tell process "TextInputMenuAgent"
		click menu bar item 1 of menu bar 2
		delay 0.2
		set m to menu 1 of menu bar item 1 of menu bar 2
		set valgt to false
		repeat with navn in {"ABC", "British", "U.S.", "English", "Engelsk"}
			if not valgt then
				try
					click (first menu item of m whose title contains navn)
					set valgt to true
				end try
			end if
		end repeat
		if not valgt then key code 53 -- Esc: luk menuen igen
	end tell
end tell
