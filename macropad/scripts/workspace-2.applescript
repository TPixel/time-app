-- Desk 2: Fotos stort til venstre, Finder-vinduer "designs" (oeverst)
-- og "MOCKUPS" (nederst) i hoejre kolonne.
-- Mapperne findes automatisk med Spotlight, saa de maa ligge hvor som helst.
-- Koeres af MacroPad'en via follow-tjenesten ("script:workspace-2").
-- (Skift til skrivebord 2 sker paa boardet med Ctrl+2 FOER scriptet koerer.)

tell application "Finder"
	set skaerm to bounds of window of desktop
end tell
set w to item 3 of skaerm
set h to item 4 of skaerm
set venstreBredde to (w * 62) div 100
set midt to 25 + ((h - 25) div 2)

set designSti to do shell script "mdfind \"kMDItemFSName == 'designs' && kMDItemContentType == 'public.folder'\" | head -1"
set mockupSti to do shell script "mdfind \"kMDItemFSName == 'MOCKUPS' && kMDItemContentType == 'public.folder'\" | head -1"

tell application "Finder"
	activate
	if designSti is not "" then
		set v1 to make new Finder window to (POSIX file designSti as alias)
	else
		set v1 to make new Finder window
	end if
	set bounds of v1 to {venstreBredde, 25, w, midt}
	if mockupSti is not "" then
		set v2 to make new Finder window to (POSIX file mockupSti as alias)
	else
		set v2 to make new Finder window
	end if
	set bounds of v2 to {venstreBredde, midt, w, h}
end tell

tell application "Photos"
	activate
end tell
delay 0.8
try
	tell application "Photos"
		set bounds of front window to {0, 25, venstreBredde, h}
	end tell
on error
	-- Photos er naesten ikke scriptbar — fald tilbage til System Events
	tell application "System Events"
		tell process "Photos"
			try
				set position of front window to {0, 25}
				set size of front window to {venstreBredde, h - 25}
			end try
		end tell
	end tell
end try
