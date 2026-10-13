// a counter
module counter #(parameter int WIDTH = 8) (
    input  logic clk,
    input  logic reset,
    output logic [WIDTH-1:0] count
);

    typedef enum logic [1:0] { IDLE, RUN, DONE } state_t;
    state_t state;

    always_ff @(posedge clk or posedge reset) begin
        if (reset) begin
            count <= '0;
            state <= IDLE;
        end else begin
            count <= count + 1;
        end
    end

    interface bus_if;
        logic [7:0] data;
    endinterface

    assert property (@(posedge clk) count != 8'hFF);
endmodule
