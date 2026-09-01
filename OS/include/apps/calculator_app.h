#ifndef OXYGEN_APPS_CALCULATOR_APP_H
#define OXYGEN_APPS_CALCULATOR_APP_H

#include "apps/app.h"

struct CalcButton {
    const char* label;
    int32_t x;
    int32_t y;
    int32_t w;
    int32_t h;
    Color   bg_color;
    Color   fg_color;
};

class CalculatorApp : public Application {
public:
    CalculatorApp();
    virtual ~CalculatorApp();

    virtual void on_init(Window* window) override;
    virtual void on_paint(const Rect& client_area) override;
    virtual void on_mouse_down(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_mouse_up(int32_t local_x, int32_t local_y, uint8_t buttons) override;
    virtual void on_key_down(uint8_t scancode, char ascii) override;

    void handle_button_click(const char* label);
    void evaluate(void);
    void clear_all(void);
    void clear_entry(void);

private:
    Window* m_window;
    char    m_display_str[32];
    double  m_current_value;
    double  m_stored_value;
    char    m_pending_op;
    bool    m_new_number_entry;
    bool    m_has_decimal;
    bool    m_has_error;
    int32_t m_pressed_button_idx;

    void set_display_number(double val);
    void append_digit(char digit);
    void append_decimal(void);
    void set_operation(char op);
    void toggle_sign(void);
};

#endif // OXYGEN_APPS_CALCULATOR_APP_H
