// Desktop entry point. Mobile never reaches this — see the `mobile_entry_point`
// in lib.rs, which the platform's own launcher calls instead.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    transcrape_lib::run()
}
