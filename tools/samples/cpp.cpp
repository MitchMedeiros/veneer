#include <iostream>
#include <vector>

namespace app::detail {

/// Doc comment
template <typename T, std::size_t N = 4>
class Buffer : public Base<T> {
public:
    explicit Buffer(std::initializer_list<T> init) : data_(init) {}
    virtual ~Buffer() noexcept = default;
    [[nodiscard]] constexpr auto size() const -> std::size_t { return N; }
    T& operator[](std::size_t i) { return data_.at(i); }

private:
    std::vector<T> data_;
};

}  // namespace app::detail

// line comment
auto main(int argc, char* argv[]) -> int {
    using namespace std::literals;
    auto s = "text"s;
    auto raw = R"(raw "string" \n)";
    auto lam = [&, x = 1](auto&& a) mutable { return a + x; };
    std::unique_ptr<int> p = std::make_unique<int>(42);
    try {
        throw std::runtime_error("bad");
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
    }
    for (auto const& v : std::vector<int>{1, 2, 3}) std::cout << v << ' ';
    return static_cast<int>(0x1Fu + 1'000 + 3.5);
}
