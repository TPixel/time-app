-- Saet skaermens lysstyrke til praecis 80% via 'brightness'-CLI'en
-- (installeres med: brew install brightness).
-- Koeres af MacroPad'en via follow-tjenesten ("script:screen-80").

do shell script "/opt/homebrew/bin/brightness 0.8 2>/dev/null || /usr/local/bin/brightness 0.8"
