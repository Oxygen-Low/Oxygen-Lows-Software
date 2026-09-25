#include "apps/installer_app.h"
#include "gui/graphics.h"
#include "gui/font.h"
#include "gui/theme.h"
#include "gui/window.h"
#include "arch/x86_64/acpi.h"
#include "arch/x86_64/pit.h"
#include "drivers/serial.h"

namespace {

static InstallerApp* g_active_installer = nullptr;

void installer_progress_bridge(const char* step, int pct) {
    if (g_active_installer) {
        g_active_installer->set_progress(step, pct);
    }
}

void str_copy_safe(char* dest, const char* src, size_t max_len) {
    if (!dest || !src || max_len == 0) return;
    size_t i = 0;
    while (src[i] && i < max_len - 1) {
        dest[i] = src[i];
        i++;
    }
    dest[i] = '\0';
}

} // anonymous namespace

InstallerApp::InstallerApp(InstallerMode initial_mode)
    : m_window(nullptr),
      m_mode(initial_mode),
      m_page(PAGE_WELCOME),
      m_selected_drive(0),
      m_progress_pct(0),
      m_operation_running(false),
      m_operation_finished(false),
      m_operation_success(false),
      m_countdown_active(false),
      m_countdown_seconds(10),
      m_last_countdown_tick(0),
      m_log_count(0)
{
    g_active_installer = this;
    str_copy_safe(m_status_text, "Ready to begin.", sizeof(m_status_text));
    for (int i = 0; i < 8; ++i) m_logs[i][0] = '\0';
}

InstallerApp::~InstallerApp() {
    if (g_active_installer == this) {
        g_active_installer = nullptr;
    }
}

void InstallerApp::on_init(Window* window) {
    m_window = window;
    // Auto-select first present ATA drive
    for (uint8_t i = 0; i < 4; ++i) {
        const ATADriveInfo* d = ata_get_drive_info(i);
        if (d && d->present && !d->is_atapi) {
            m_selected_drive = i;
            break;
        }
    }
}

void InstallerApp::set_mode(InstallerMode mode) {
    m_mode = mode;
}

void InstallerApp::add_log(const char* message) {
    if (!message) return;
    if (m_log_count < 8) {
        str_copy_safe(m_logs[m_log_count++], message, sizeof(m_logs[0]));
    } else {
        for (int i = 0; i < 7; ++i) {
            str_copy_safe(m_logs[i], m_logs[i + 1], sizeof(m_logs[0]));
        }
        str_copy_safe(m_logs[7], message, sizeof(m_logs[0]));
    }
}

void InstallerApp::set_progress(const char* step, int pct) {
    m_progress_pct = pct;
    str_copy_safe(m_status_text, step, sizeof(m_status_text));
    add_log(step);
    serial_printf("[INSTALLER] (%d%%) %s\n", pct, step);
}

void InstallerApp::on_paint(const Rect& client_area) {
    // Background fill
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, Color(15, 23, 42, 255));

    // Top Header Banner
    int32_t header_h = 56;
    gfx_fill_gradient_v(client_area.x, client_area.y, client_area.width, header_h,
                        Color(28, 37, 65, 255), Color(15, 23, 42, 255));
    gfx_draw_line(client_area.x, client_area.y + header_h,
                  client_area.x + client_area.width, client_area.y + header_h,
                  COLOR_OXYGEN_CYAN);

    font_draw_string(client_area.x + 16, client_area.y + 12,
                     "Oxygen Low's Software — Setup & Maintenance Wizard",
                     COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT);

    const char* subheader = "Version 1.4.0 (x86_64 Production Release)";
    font_draw_string(client_area.x + 16, client_area.y + 32,
                     subheader, Color(148, 163, 184, 255), COLOR_TRANSPARENT);

    int32_t content_y = client_area.y + header_h + 16;
    int32_t content_w = client_area.width - 32;

    switch (m_page) {
        case PAGE_WELCOME: {
            font_draw_string(client_area.x + 16, content_y,
                             "Select the operation you wish to perform on this computer:",
                             COLOR_WHITE, COLOR_TRANSPARENT);

            // Option 1: Clean Install
            bool sel_inst = (m_mode == INSTALL_MODE_INSTALL);
            Color bg1 = sel_inst ? Color(30, 58, 102, 255) : Color(30, 41, 59, 255);
            Color bdr1 = sel_inst ? COLOR_OXYGEN_CYAN : Color(71, 85, 105, 255);
            gfx_fill_rounded_rect(client_area.x + 16, content_y + 28, content_w, 48, 6, bg1);
            gfx_draw_rounded_rect(client_area.x + 16, content_y + 28, content_w, 48, 6, bdr1);
            font_draw_string(client_area.x + 32, content_y + 36,
                             "[1] Clean Install Operating System",
                             sel_inst ? COLOR_OXYGEN_CYAN : COLOR_WHITE, COLOR_TRANSPARENT);
            font_draw_string(client_area.x + 32, content_y + 54,
                             "Format target storage and deploy fresh Oxygen Low's Software OS installation.",
                             Color(148, 163, 184, 255), COLOR_TRANSPARENT);

            // Option 2: Update Existing
            bool sel_upd = (m_mode == INSTALL_MODE_UPDATE);
            Color bg2 = sel_upd ? Color(30, 58, 102, 255) : Color(30, 41, 59, 255);
            Color bdr2 = sel_upd ? COLOR_OXYGEN_CYAN : Color(71, 85, 105, 255);
            gfx_fill_rounded_rect(client_area.x + 16, content_y + 84, content_w, 48, 6, bg2);
            gfx_draw_rounded_rect(client_area.x + 16, content_y + 84, content_w, 48, 6, bdr2);
            font_draw_string(client_area.x + 32, content_y + 92,
                             "[2] Update Existing Installation",
                             sel_upd ? COLOR_OXYGEN_CYAN : COLOR_WHITE, COLOR_TRANSPARENT);
            font_draw_string(client_area.x + 32, content_y + 110,
                             "Upgrade kernel & system components while preserving user files and data.",
                             Color(148, 163, 184, 255), COLOR_TRANSPARENT);

            // Option 3: Repair
            bool sel_rep = (m_mode == INSTALL_MODE_REPAIR);
            Color bg3 = sel_rep ? Color(30, 58, 102, 255) : Color(30, 41, 59, 255);
            Color bdr3 = sel_rep ? COLOR_OXYGEN_CYAN : Color(71, 85, 105, 255);
            gfx_fill_rounded_rect(client_area.x + 16, content_y + 140, content_w, 48, 6, bg3);
            gfx_draw_rounded_rect(client_area.x + 16, content_y + 140, content_w, 48, 6, bdr3);
            font_draw_string(client_area.x + 32, content_y + 148,
                             "[3] Repair & Verify Installation",
                             sel_rep ? COLOR_OXYGEN_CYAN : COLOR_WHITE, COLOR_TRANSPARENT);
            font_draw_string(client_area.x + 32, content_y + 166,
                             "Diagnose and restore boot sectors, MBR, and corrupted system files.",
                             Color(148, 163, 184, 255), COLOR_TRANSPARENT);

            // Next Button
            int32_t btn_y = client_area.y + client_area.height - 48;
            gfx_fill_rounded_rect(client_area.x + client_area.width - 140, btn_y, 120, 34, 4, COLOR_OXYGEN_BLUE);
            gfx_draw_rounded_rect(client_area.x + client_area.width - 140, btn_y, 120, 34, 4, COLOR_OXYGEN_CYAN);
            font_draw_string(client_area.x + client_area.width - 110, btn_y + 9, "Next ->", COLOR_WHITE);
            break;
        }

        case PAGE_DISK_SELECT: {
            font_draw_string(client_area.x + 16, content_y,
                             "Select the target storage drive:",
                             COLOR_WHITE, COLOR_TRANSPARENT);

            int32_t list_y = content_y + 24;
            int found_count = 0;
            for (uint8_t i = 0; i < 4; ++i) {
                const ATADriveInfo* d = ata_get_drive_info(i);
                if (d && d->present && !d->is_atapi) {
                    bool sel = (m_selected_drive == static_cast<int32_t>(i));
                    Color bg = sel ? Color(30, 58, 102, 255) : Color(30, 41, 59, 255);
                    Color bdr = sel ? COLOR_OXYGEN_CYAN : Color(71, 85, 105, 255);

                    gfx_fill_rounded_rect(client_area.x + 16, list_y, content_w, 42, 4, bg);
                    gfx_draw_rounded_rect(client_area.x + 16, list_y, content_w, 42, 4, bdr);

                    const char* bus_name = (i == 0) ? "Primary Master" : (i == 1) ? "Primary Slave" : (i == 2) ? "Secondary Master" : "Secondary Slave";
                    font_printf(client_area.x + 28, list_y + 8, sel ? COLOR_OXYGEN_CYAN : COLOR_WHITE, COLOR_TRANSPARENT,
                                "Drive %u (%s) — %s", i, bus_name, d->model[0] ? d->model : "Generic Hard Disk");
                    font_printf(client_area.x + 28, list_y + 24, Color(148, 163, 184, 255), COLOR_TRANSPARENT,
                                "Capacity: %u MB  |  Sectors: %u  |  Interface: ATA/IDE PIO", d->size_in_mb, d->total_sectors);

                    list_y += 48;
                    found_count++;
                }
            }

            if (found_count == 0) {
                font_draw_string(client_area.x + 28, list_y + 20,
                                 "No hard disk drives detected. Please attach an ATA hard disk.",
                                 COLOR_CLOSE_RED, COLOR_TRANSPARENT);
            }

            // Back & Next Buttons
            int32_t btn_y = client_area.y + client_area.height - 48;
            gfx_fill_rounded_rect(client_area.x + 16, btn_y, 100, 34, 4, Color(51, 65, 85, 255));
            font_draw_string(client_area.x + 36, btn_y + 9, "<- Back", COLOR_WHITE);

            if (found_count > 0) {
                gfx_fill_rounded_rect(client_area.x + client_area.width - 140, btn_y, 120, 34, 4, COLOR_OXYGEN_BLUE);
                gfx_draw_rounded_rect(client_area.x + client_area.width - 140, btn_y, 120, 34, 4, COLOR_OXYGEN_CYAN);
                font_draw_string(client_area.x + client_area.width - 110, btn_y + 9, "Next ->", COLOR_WHITE);
            }
            break;
        }

        case PAGE_CONFIRM: {
            font_draw_string(client_area.x + 16, content_y,
                             "Confirm Operation & Destination:",
                             COLOR_WHITE, COLOR_TRANSPARENT);

            gfx_fill_rounded_rect(client_area.x + 16, content_y + 24, content_w, 140, 6, Color(30, 41, 59, 255));
            gfx_draw_rounded_rect(client_area.x + 16, content_y + 24, content_w, 140, 6, Color(71, 85, 105, 255));

            const char* op_name = (m_mode == INSTALL_MODE_INSTALL) ? "Clean Install Oxygen Low's Software" :
                                  (m_mode == INSTALL_MODE_UPDATE)  ? "Update Existing Installation" :
                                                                     "Repair & Verify Installation";
            font_printf(client_area.x + 32, content_y + 36, COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT,
                        "Action: %s", op_name);

            const ATADriveInfo* d = ata_get_drive_info(m_selected_drive);
            font_printf(client_area.x + 32, content_y + 56, COLOR_WHITE, COLOR_TRANSPARENT,
                        "Destination Drive: Drive %d (%s, %u MB)",
                        m_selected_drive, d ? d->model : "Hard Disk", d ? d->size_in_mb : 0);

            if (m_mode == INSTALL_MODE_INSTALL) {
                font_draw_string(client_area.x + 32, content_y + 80,
                                 "WARNING: Clean Install will re-partition and format the target drive.",
                                 COLOR_CLOSE_RED, COLOR_TRANSPARENT);
                font_draw_string(client_area.x + 32, content_y + 98,
                                 "All existing data on this drive will be erased.",
                                 Color(254, 202, 202, 255), COLOR_TRANSPARENT);
            } else if (m_mode == INSTALL_MODE_UPDATE) {
                font_draw_string(client_area.x + 32, content_y + 80,
                                 "Notice: System files will be upgraded to Oxygen Low's Software v1.4.0.",
                                 COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT);
                font_draw_string(client_area.x + 32, content_y + 98,
                                 "Existing user files and settings will be preserved.",
                                 Color(148, 163, 184, 255), COLOR_TRANSPARENT);
            } else {
                font_draw_string(client_area.x + 32, content_y + 80,
                                 "Notice: MBR, FAT32 partition structures, and core files will be verified.",
                                 COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT);
                font_draw_string(client_area.x + 32, content_y + 98,
                                 "Corrupted or missing OS components will be restored.",
                                 Color(148, 163, 184, 255), COLOR_TRANSPARENT);
            }

            // Back & Start Buttons
            int32_t btn_y = client_area.y + client_area.height - 48;
            gfx_fill_rounded_rect(client_area.x + 16, btn_y, 100, 34, 4, Color(51, 65, 85, 255));
            font_draw_string(client_area.x + 36, btn_y + 9, "<- Back", COLOR_WHITE);

            gfx_fill_rounded_rect(client_area.x + client_area.width - 160, btn_y, 140, 34, 4, Color(22, 101, 52, 255));
            gfx_draw_rounded_rect(client_area.x + client_area.width - 160, btn_y, 140, 34, 4, Color(34, 197, 94, 255));
            font_draw_string(client_area.x + client_area.width - 142, btn_y + 9, "Start Process", COLOR_WHITE);
            break;
        }

        case PAGE_PROGRESS: {
            font_draw_string(client_area.x + 16, content_y,
                             "Applying changes to storage...",
                             COLOR_WHITE, COLOR_TRANSPARENT);

            // Progress Bar Container
            int32_t pb_y = content_y + 24;
            int32_t pb_w = content_w;
            int32_t pb_h = 24;
            gfx_fill_rounded_rect(client_area.x + 16, pb_y, pb_w, pb_h, 4, Color(30, 41, 59, 255));
            gfx_draw_rounded_rect(client_area.x + 16, pb_y, pb_w, pb_h, 4, Color(71, 85, 105, 255));

            // Fill percentage
            int32_t fill_w = (pb_w - 4) * m_progress_pct / 100;
            if (fill_w > 0) {
                gfx_fill_rounded_rect(client_area.x + 18, pb_y + 2, fill_w, pb_h - 4, 3, COLOR_OXYGEN_CYAN);
            }

            font_printf(client_area.x + 16, pb_y + 32, COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT,
                        "Progress: %d%% — %s", m_progress_pct, m_status_text);

            // Log Console Box
            int32_t log_box_y = pb_y + 56;
            int32_t log_box_h = client_area.height - (log_box_y - client_area.y) - 20;
            gfx_fill_rounded_rect(client_area.x + 16, log_box_y, content_w, log_box_h, 4, Color(11, 19, 43, 255));
            gfx_draw_rounded_rect(client_area.x + 16, log_box_y, content_w, log_box_h, 4, Color(51, 65, 85, 255));

            int32_t cur_log_y = log_box_y + 8;
            for (int i = 0; i < m_log_count && i < 8; ++i) {
                font_draw_string(client_area.x + 24, cur_log_y, m_logs[i], Color(148, 163, 184, 255), COLOR_TRANSPARENT);
                cur_log_y += 18;
            }
            break;
        }

        case PAGE_FINISH: {
            Color res_col = m_operation_success ? Color(34, 197, 94, 255) : COLOR_CLOSE_RED;
            font_draw_string(client_area.x + 16, content_y,
                             m_operation_success ? "Operation completed successfully!" : "Operation encountered an error.",
                             res_col, COLOR_TRANSPARENT);

            gfx_fill_rounded_rect(client_area.x + 16, content_y + 28, content_w, 110, 6, Color(30, 41, 59, 255));
            gfx_draw_rounded_rect(client_area.x + 16, content_y + 28, content_w, 110, 6, res_col);

            const char* op_label = (m_mode == INSTALL_MODE_INSTALL) ? "Oxygen Low's Software is installed and ready to boot." :
                                   (m_mode == INSTALL_MODE_UPDATE)  ? "Oxygen Low's Software has been updated to v1.4.0." :
                                                                     "Oxygen Low's Software installation has been repaired.";
            font_draw_string(client_area.x + 32, content_y + 42, op_label, COLOR_WHITE, COLOR_TRANSPARENT);

            if (m_countdown_active) {
                font_printf(client_area.x + 32, content_y + 68, COLOR_OXYGEN_CYAN, COLOR_TRANSPARENT,
                            "Automatic restart in %d seconds...", m_countdown_seconds);
                font_draw_string(client_area.x + 32, content_y + 90,
                                 "Click 'Stay in Live Desktop' below to cancel automatic restart.",
                                 Color(148, 163, 184, 255), COLOR_TRANSPARENT);
            } else {
                font_draw_string(client_area.x + 32, content_y + 68,
                                 "Automatic restart cancelled. You are in the Live Desktop environment.",
                                 Color(148, 163, 184, 255), COLOR_TRANSPARENT);
            }

            // Buttons: Cancel Countdown / Stay in Live Desktop & Reboot Now
            int32_t btn_y = client_area.y + client_area.height - 48;
            gfx_fill_rounded_rect(client_area.x + 16, btn_y, 190, 34, 4, Color(51, 65, 85, 255));
            font_draw_string(client_area.x + 28, btn_y + 9, "Stay in Live Desktop", COLOR_WHITE);

            gfx_fill_rounded_rect(client_area.x + client_area.width - 150, btn_y, 130, 34, 4, Color(22, 101, 52, 255));
            gfx_draw_rounded_rect(client_area.x + client_area.width - 150, btn_y, 130, 34, 4, Color(34, 197, 94, 255));
            font_draw_string(client_area.x + client_area.width - 132, btn_y + 9, "Reboot Now", COLOR_WHITE);
            break;
        }
    }
}

void InstallerApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    if (!(buttons & 1)) return;
    if (!m_window) return;

    Rect ca = m_window->get_client_area();
    int32_t content_y = 56 + 16;
    int32_t btn_y = ca.height - 48;

    switch (m_page) {
        case PAGE_WELCOME: {
            // Check mode clicks
            if (local_y >= content_y + 28 && local_y < content_y + 76) {
                m_mode = INSTALL_MODE_INSTALL;
            } else if (local_y >= content_y + 84 && local_y < content_y + 132) {
                m_mode = INSTALL_MODE_UPDATE;
            } else if (local_y >= content_y + 140 && local_y < content_y + 188) {
                m_mode = INSTALL_MODE_REPAIR;
            } else if (local_x >= ca.width - 140 && local_x < ca.width - 20 &&
                       local_y >= btn_y && local_y < btn_y + 34) {
                m_page = PAGE_DISK_SELECT;
            }
            break;
        }

        case PAGE_DISK_SELECT: {
            int32_t list_y = content_y + 24;
            for (uint8_t i = 0; i < 4; ++i) {
                const ATADriveInfo* d = ata_get_drive_info(i);
                if (d && d->present && !d->is_atapi) {
                    if (local_y >= list_y && local_y < list_y + 42) {
                        m_selected_drive = i;
                    }
                    list_y += 48;
                }
            }

            // Back button
            if (local_x >= 16 && local_x < 116 && local_y >= btn_y && local_y < btn_y + 34) {
                m_page = PAGE_WELCOME;
            }
            // Next button
            else if (local_x >= ca.width - 140 && local_x < ca.width - 20 &&
                     local_y >= btn_y && local_y < btn_y + 34) {
                m_page = PAGE_CONFIRM;
            }
            break;
        }

        case PAGE_CONFIRM: {
            // Back button
            if (local_x >= 16 && local_x < 116 && local_y >= btn_y && local_y < btn_y + 34) {
                m_page = PAGE_DISK_SELECT;
            }
            // Start button
            else if (local_x >= ca.width - 160 && local_x < ca.width - 20 &&
                     local_y >= btn_y && local_y < btn_y + 34) {
                m_page = PAGE_PROGRESS;
                m_operation_running = true;
                run_operation();
            }
            break;
        }

        case PAGE_PROGRESS:
            break;

        case PAGE_FINISH: {
            // Stay in Live Desktop button
            if (local_x >= 16 && local_x < 206 && local_y >= btn_y && local_y < btn_y + 34) {
                cancel_countdown();
            }
            // Reboot Now button
            else if (local_x >= ca.width - 150 && local_x < ca.width - 20 &&
                     local_y >= btn_y && local_y < btn_y + 34) {
                reboot_system();
            }
            break;
        }
    }
}

void InstallerApp::on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(local_x);
    UNUSED(local_y);
    UNUSED(buttons);
}

void InstallerApp::on_key_down(uint8_t scancode, char ascii) {
    UNUSED(scancode);
    if (m_page == PAGE_WELCOME) {
        if (ascii == '1') m_mode = INSTALL_MODE_INSTALL;
        else if (ascii == '2') m_mode = INSTALL_MODE_UPDATE;
        else if (ascii == '3') m_mode = INSTALL_MODE_REPAIR;
        else if (ascii == '\n' || ascii == '\r') m_page = PAGE_DISK_SELECT;
    } else if (m_page == PAGE_DISK_SELECT) {
        if (ascii >= '0' && ascii <= '3') {
            uint8_t d = ascii - '0';
            if (ata_is_drive_present(d)) m_selected_drive = d;
        } else if (ascii == '\n' || ascii == '\r') {
            m_page = PAGE_CONFIRM;
        }
    } else if (m_page == PAGE_CONFIRM) {
        if (ascii == '\n' || ascii == '\r') {
            m_page = PAGE_PROGRESS;
            m_operation_running = true;
            run_operation();
        }
    } else if (m_page == PAGE_FINISH) {
        if (ascii == 'c' || ascii == 'C' || ascii == 27) { // Escape or 'c'
            cancel_countdown();
        } else if (ascii == 'r' || ascii == 'R' || ascii == '\n' || ascii == '\r') {
            reboot_system();
        }
    }
}

void InstallerApp::run_operation(void) {
    bool ok = false;
    if (m_mode == INSTALL_MODE_INSTALL) {
        ok = fat32_install_system(static_cast<uint8_t>(m_selected_drive), installer_progress_bridge);
    } else if (m_mode == INSTALL_MODE_UPDATE) {
        ok = fat32_update_system(static_cast<uint8_t>(m_selected_drive), installer_progress_bridge);
    } else if (m_mode == INSTALL_MODE_REPAIR) {
        ok = fat32_verify_and_repair(static_cast<uint8_t>(m_selected_drive), installer_progress_bridge);
    }

    m_operation_running = false;
    m_operation_finished = true;
    m_operation_success = ok;
    m_page = PAGE_FINISH;

    if (ok) {
        m_countdown_active = true;
        m_countdown_seconds = 10;
        m_last_countdown_tick = pit_get_uptime_ms();
    }
}

void InstallerApp::cancel_countdown(void) {
    m_countdown_active = false;
}

void InstallerApp::reboot_system(void) {
    serial_printf("[INSTALLER] Rebooting system into Oxygen Low's Software...\n");
    acpi_reboot();
}

void InstallerApp::on_update(void) {
    if (m_countdown_active) {
        uint64_t now = pit_get_uptime_ms();
        if (now - m_last_countdown_tick >= 1000) {
            m_last_countdown_tick = now;
            m_countdown_seconds--;
            if (m_countdown_seconds <= 0) {
                m_countdown_active = false;
                reboot_system();
            }
        }
    }
}
