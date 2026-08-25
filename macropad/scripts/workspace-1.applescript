-- Workspace-makro: saet skaermen op med programmer og mappe-vinduer.
-- Venstre halvdel: Pixelmator Pro. Hoejre halvdel: Finder-vindue med
-- "Grafik upload" fra Skrivebordet.
-- Koeres af MacroPad'en via follow-tjenesten ("script:workspace-1").
--
-- LAYOUTET rettes nemt: bounds er {venstre, top, hoejre, bund} i pixels.

tell application "Finder"
	set skaerm to bounds of window of desktop
end tell
set w to item 3 of skaerm
set h to item 4 of skaerm
set halv to w div 2

-- Hoejre halvdel: Finder-vindue med "Grafik upload"
set mappen to (path to desktop folder as text) & "Grafik upload"
tell application "Finder"
	activate
	try
		set vin to make new Finder window to folder mappen
	on error
		set vin to make new Finder window
	end try
	set bounds of vin to {halv, 25, w, h}
end tell

-- Venstre halvdel: Pixelmator Pro (fast sti: Thomas' version 3.8 —
-- IKKE den nye "Creator Studio", som ogsaa kalder sig "Pixelmator Pro")
tell application "/Applications/Pixelmator Pro.app"
	activate
end tell
delay 0.6
tell application "/Applications/Pixelmator Pro.app"
	try
		set bounds of front window to {0, 25, halv, h}
	end try
end tell
