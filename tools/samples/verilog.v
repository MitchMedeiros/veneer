// a counter
module counter #(parameter WIDTH = 8) (
    input wire clk,
    input wire reset,
    output reg [WIDTH-1:0] count
);

    /* block comment */
    always @(posedge clk or posedge reset) begin
        if (reset)
            count <= 8'h00;
        else
            count <= count + 1;
    end

    wire done = (count == 8'd255);
    initial $display("start %d", WIDTH);
endmodule
