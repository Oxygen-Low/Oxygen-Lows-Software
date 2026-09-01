#include "apps/calculator_app.h"
#include "gui/font.h"
#include "gui/window.h"

static const CalcButton g_calc_buttons[20] = {
    // Row 0
    {"C",   12, 70,  56, 42, Color(230, 57, 70, 255),  COLOR_WHITE},
    {"CE",  74, 70,  56, 42, Color(69, 123, 157, 255), COLOR_WHITE},
    {"+/-", 136, 70, 56, 42, Color(51, 65, 85, 255),  COLOR_WHITE},
    {"/",   198, 70, 56, 42, Color(8, 131, 149, 255),  COLOR_WHITE},

    // Row 1
    {"7",   12, 120, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"8",   74, 120, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"9",   136, 120, 56, 42, Color(30, 41, 59, 255), COLOR_WHITE},
    {"*",   198, 120, 56, 42, Color(8, 131, 149, 255), COLOR_WHITE},

    // Row 2
    {"4",   12, 170, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"5",   74, 170, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"6",   136, 170, 56, 42, Color(30, 41, 59, 255), COLOR_WHITE},
    {"-",   198, 170, 56, 42, Color(8, 131, 149, 255), COLOR_WHITE},

    // Row 3
    {"1",   12, 220, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"2",   74, 220, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"3",   136, 220, 56, 42, Color(30, 41, 59, 255), COLOR_WHITE},
    {"+",   198, 220, 56, 42, Color(8, 131, 149, 255), COLOR_WHITE},

    // Row 4
    {"0",   12, 270, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {".",   74, 270, 56, 42, Color(30, 41, 59, 255),  COLOR_WHITE},
    {"=",   136, 270, 56, 42, Color(0, 180, 216, 255), Color(15, 23, 42, 255)},
    {"%",   198, 270, 56, 42, Color(8, 131, 149, 255), COLOR_WHITE},
};

CalculatorApp::CalculatorApp()
    : m_window(nullptr), m_current_value(0.0), m_stored_value(0.0),
      m_pending_op('\0'), m_new_number_entry(true), m_has_decimal(false),
      m_has_error(false), m_pressed_button_idx(-1) {
    clear_all();
}

CalculatorApp::~CalculatorApp() {}

void CalculatorApp::on_init(Window* window) {
    m_window = window;
    clear_all();
}

void CalculatorApp::clear_all(void) {
    m_current_value = 0.0;
    m_stored_value = 0.0;
    m_pending_op = '\0';
    m_new_number_entry = true;
    m_has_decimal = false;
    m_has_error = false;
    m_display_str[0] = '0';
    m_display_str[1] = '\0';
}

void CalculatorApp::clear_entry(void) {
    m_current_value = 0.0;
    m_new_number_entry = true;
    m_has_decimal = false;
    m_has_error = false;
    m_display_str[0] = '0';
    m_display_str[1] = '\0';
}

void CalculatorApp::append_digit(char digit) {
    if (m_has_error) clear_all();

    if (m_new_number_entry) {
        m_display_str[0] = digit;
        m_display_str[1] = '\0';
        m_new_number_entry = false;
        m_has_decimal = false;
    } else {
        size_t len = 0;
        while (m_display_str[len]) len++;
        if (len < 16) {
            m_display_str[len] = digit;
            m_display_str[len + 1] = '\0';
        }
    }
}

void CalculatorApp::append_decimal(void) {
    if (m_has_error) clear_all();

    if (m_new_number_entry) {
        m_display_str[0] = '0';
        m_display_str[1] = '.';
        m_display_str[2] = '\0';
        m_new_number_entry = false;
        m_has_decimal = true;
    } else if (!m_has_decimal) {
        size_t len = 0;
        while (m_display_str[len]) len++;
        if (len < 15) {
            m_display_str[len] = '.';
            m_display_str[len + 1] = '\0';
            m_has_decimal = true;
        }
    }
}

void CalculatorApp::toggle_sign(void) {
    if (m_has_error || (m_display_str[0] == '0' && m_display_str[1] == '\0')) return;

    if (m_display_str[0] == '-') {
        // Remove minus
        size_t i = 0;
        while (m_display_str[i + 1]) {
            m_display_str[i] = m_display_str[i + 1];
            i++;
        }
        m_display_str[i] = '\0';
    } else {
        // Insert minus
        size_t len = 0;
        while (m_display_str[len]) len++;
        if (len < 16) {
            for (size_t i = len + 1; i > 0; --i) {
                m_display_str[i] = m_display_str[i - 1];
            }
            m_display_str[0] = '-';
        }
    }
}

static double parse_display(const char* s) {
    double res = 0.0;
    double frac = 0.1;
    bool neg = false;
    bool dec = false;

    if (*s == '-') {
        neg = true;
        s++;
    }

    while (*s) {
        if (*s == '.') {
            dec = true;
        } else if (*s >= '0' && *s <= '9') {
            if (!dec) {
                res = res * 10.0 + (*s - '0');
            } else {
                res = res + (*s - '0') * frac;
                frac *= 0.1;
            }
        }
        s++;
    }

    return neg ? -res : res;
}

void CalculatorApp::set_display_number(double val) {
    // Format double to string
    if (val < 0.0) {
        m_display_str[0] = '-';
        val = -val;
    } else {
        m_display_str[0] = '\0';
    }

    auto int_part = static_cast<int64_t>(val);
    double frac_part = val - static_cast<double>(int_part);

    char int_buf[24];
    int int_len = 0;
    if (int_part == 0) {
        int_buf[int_len++] = '0';
    } else {
        int64_t temp = int_part;
        while (temp > 0) {
            int_buf[int_len++] = '0' + (temp % 10);
            temp /= 10;
        }
    }

    size_t out_idx = (m_display_str[0] == '-') ? 1 : 0;
    for (int i = int_len - 1; i >= 0; --i) {
        int_buf[i] = int_buf[i];
        m_display_str[out_idx++] = int_buf[i];
    }
    m_display_str[out_idx] = '\0';

    // Fractional part if non-zero
    if (frac_part > 0.000001 && out_idx < 12) {
        m_display_str[out_idx++] = '.';
        for (int p = 0; p < 4; ++p) {
            frac_part *= 10.0;
            int digit = static_cast<int>(frac_part);
            m_display_str[out_idx++] = '0' + digit;
            frac_part -= digit;
        }
        // Trim trailing zeros
        while (out_idx > 1 && m_display_str[out_idx - 1] == '0') out_idx--;
        if (out_idx > 1 && m_display_str[out_idx - 1] == '.') out_idx--;
        m_display_str[out_idx] = '\0';
    }
}

void CalculatorApp::set_operation(char op) {
    if (m_has_error) return;

    if (m_pending_op != '\0' && !m_new_number_entry) {
        evaluate();
    } else {
        m_stored_value = parse_display(m_display_str);
    }

    m_pending_op = op;
    m_new_number_entry = true;
    m_has_decimal = false;
}

void CalculatorApp::evaluate(void) {
    if (m_has_error || m_pending_op == '\0') return;

    double operand2 = parse_display(m_display_str);
    double result = 0.0;

    if (m_pending_op == '+') {
        result = m_stored_value + operand2;
    } else if (m_pending_op == '-') {
        result = m_stored_value - operand2;
    } else if (m_pending_op == '*') {
        result = m_stored_value * operand2;
    } else if (m_pending_op == '/') {
        if (operand2 == 0.0) {
            // Divide by zero protection!
            const char* err = "Error: Div by 0";
            size_t idx = 0;
            while (err[idx]) { m_display_str[idx] = err[idx]; idx++; }
            m_display_str[idx] = '\0';
            m_has_error = true;
            m_pending_op = '\0';
            return;
        }
        result = m_stored_value / operand2;
    } else if (m_pending_op == '%') {
        if (operand2 == 0.0) {
            const char* err = "Error: Div by 0";
            size_t idx = 0;
            while (err[idx]) { m_display_str[idx] = err[idx]; idx++; }
            m_display_str[idx] = '\0';
            m_has_error = true;
            m_pending_op = '\0';
            return;
        }
        result = static_cast<double>(static_cast<int64_t>(m_stored_value) % static_cast<int64_t>(operand2));
    }

    set_display_number(result);
    m_stored_value = result;
    m_pending_op = '\0';
    m_new_number_entry = true;
    m_has_decimal = false;
}

void CalculatorApp::handle_button_click(const char* label) {
    if (label[0] >= '0' && label[0] <= '9' && label[1] == '\0') {
        append_digit(label[0]);
    } else if (label[0] == '.' && label[1] == '\0') {
        append_decimal();
    } else if (label[0] == '+' && label[1] == '-' && label[2] == '/') {
        toggle_sign();
    } else if (label[0] == 'C' && label[1] == '\0') {
        clear_all();
    } else if (label[0] == 'C' && label[1] == 'E') {
        clear_entry();
    } else if (label[0] == '=' && label[1] == '\0') {
        evaluate();
    } else if (label[0] == '+' || label[0] == '-' || label[0] == '*' || label[0] == '/' || label[0] == '%') {
        set_operation(label[0]);
    }
}

void CalculatorApp::on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(buttons);
    for (int32_t i = 0; i < 20; ++i) {
        const CalcButton& btn = g_calc_buttons[i];
        Rect r(btn.x, btn.y, btn.w, btn.h);
        if (r.contains(local_x, local_y)) {
            m_pressed_button_idx = i;
            handle_button_click(btn.label);
            if (m_window) m_window->is_dirty = true;
            break;
        }
    }
}

void CalculatorApp::on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) {
    UNUSED(local_x); UNUSED(local_y); UNUSED(buttons);
    m_pressed_button_idx = -1;
    if (m_window) m_window->is_dirty = true;
}

void CalculatorApp::on_key_down(uint8_t scancode, char ascii) {
    UNUSED(scancode);
    if (ascii >= '0' && ascii <= '9') {
        append_digit(ascii);
    } else if (ascii == '.') {
        append_decimal();
    } else if (ascii == '+' || ascii == '-' || ascii == '*' || ascii == '/' || ascii == '%') {
        set_operation(ascii);
    } else if (ascii == '=' || ascii == '\n' || ascii == '\r') {
        evaluate();
    } else if (ascii == 'c' || ascii == 'C' || ascii == 0x1B) { // Esc
        clear_all();
    } else if (ascii == '\b') {
        clear_entry();
    }
    if (m_window) m_window->is_dirty = true;
}

void CalculatorApp::on_paint(const Rect& client_area) {
    // Background
    gfx_fill_rect(client_area.x, client_area.y, client_area.width, client_area.height, Color(15, 23, 42, 255));

    // 1. Digital LCD Screen Display
    int32_t lcd_x = client_area.x + 12;
    int32_t lcd_y = client_area.y + 12;
    int32_t lcd_w = client_area.width - 24;
    int32_t lcd_h = 46;

    gfx_fill_rounded_rect(lcd_x, lcd_y, lcd_w, lcd_h, 4, Color(2, 6, 23, 255));
    gfx_draw_rounded_rect(lcd_x, lcd_y, lcd_w, lcd_h, 4, Color(8, 131, 149, 255));

    // Operation indicator in top-left of LCD
    if (m_pending_op != '\0') {
        char op_str[2] = {m_pending_op, '\0'};
        font_draw_string(lcd_x + 8, lcd_y + 6, op_str, Color(148, 163, 184, 255));
    }

    // Right-aligned LCD Number Text
    int32_t text_w = font_measure_string_width(m_display_str);
    int32_t text_x = lcd_x + lcd_w - text_w - 12;
    int32_t text_y = lcd_y + (lcd_h - 16) / 2;
    Color num_color = m_has_error ? COLOR_CLOSE_RED : Color(0, 240, 255, 255);

    font_draw_string(text_x, text_y, m_display_str, num_color);

    // 2. 4x5 Button Grid
    for (int32_t i = 0; i < 20; ++i) {
        const CalcButton& btn = g_calc_buttons[i];
        int32_t bx = client_area.x + btn.x;
        int32_t by = client_area.y + btn.y;

        Color bg = (m_pressed_button_idx == i) ? Color(8, 131, 149, 255) : btn.bg_color;
        gfx_fill_rounded_rect(bx, by, btn.w, btn.h, 4, bg);
        gfx_draw_rounded_rect(bx, by, btn.w, btn.h, 4, Color(51, 65, 85, 255));

        // Center Label
        int32_t label_w = font_measure_string_width(btn.label);
        int32_t lx = bx + (btn.w - label_w) / 2;
        int32_t ly = by + (btn.h - 16) / 2;
        font_draw_string(lx, ly, btn.label, btn.fg_color);
    }
}
