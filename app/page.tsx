"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { ChevronRight, Loader2 } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import Sentiment from "sentiment";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, Tooltip, Legend, Title, ArcElement } from "chart.js";
import Image from "next/image";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css"; // Import styles if using the skeleton library

ChartJS.register(ArcElement, Tooltip, Legend, Title);

const sentiment = new Sentiment();

const LandingPage: React.FC = () => {
  const [isFetchingVideos, setIsFetchingVideos] = useState(true);
  const [youtubeLink, setYoutubeLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentimentData, setSentimentData] = useState<number[]>([]);
  const [topComments, setTopComments] = useState<
    { text: string; score: number }[]
  >([]);
  const [percentages, setPercentages] = useState<{
    positive: number;
    negative: number;
    neutral: number;
  }>({
    positive: 0,
    negative: 0,
    neutral: 0,
  });
  const [sliderValue, setSliderValue] = useState<number>(3000); // State for slider value
  const { toast } = useToast();
  const [videos, setVideos] = useState<
    { thumbnail: string; title: string; videoId: string }[]
  >([]);
  const pieChartRef = useRef<HTMLDivElement>(null); // Create a ref for the Pie chart container
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (e: any) => {
    const scrollPosition = e.target.scrollLeft;
    const itemWidth = e.target.offsetWidth;
    const newIndex = Math.round(scrollPosition / itemWidth);
    setActiveIndex(newIndex);
  };

  useEffect(() => {
    const carousel = document.querySelector(".carousel");
    if (!carousel) return;
    carousel.addEventListener("scroll", handleScroll);
    return () => carousel.removeEventListener("scroll", handleScroll);
  }, []);

  const items = isFetchingVideos ? [...Array(5)] : videos;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYoutubeLink(e.target.value);
  };

  
  function extractVideoId(url: string) {
    const regExp =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  }

  const handleSubmit = async () => {
    setLoading(true);
    setSentimentData([]); // Clear previous sentiment data
    setTopComments([]); // Clear previous top comments
    setPercentages({ positive: 0, negative: 0, neutral: 0 }); // Clear previous percentages

    const videoId = extractVideoId(youtubeLink);

    if (videoId) {
      try {
        let allComments: any[] = [];
        let nextPageToken: string | undefined = undefined;
        const maxResults = 100; // Maximum per page
        const totalCommentsNeeded = sliderValue; // Use slider value

        // Fetch comments with pagination
        do {
          const response: any = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?key=${
              process.env.NEXT_PUBLIC_YOUTUBE_API
            }&part=snippet&videoId=${videoId}&maxResults=${maxResults}${
              nextPageToken ? `&pageToken=${nextPageToken}` : ""
            }`
          );
          const result = await response.json();

          if (result.items && result.items.length > 0) {
            allComments = allComments.concat(result.items);
            nextPageToken = result.nextPageToken;
          } else {
            toast({
              description: "No more comments available.",
            });
            break;
          }
        } while (nextPageToken && allComments.length < totalCommentsNeeded);

        // Limit to slider value if more are fetched
        allComments = allComments.slice(0, totalCommentsNeeded);

        // Randomly select comments from the fetched comments
        const shuffledComments = allComments.sort(() => Math.random() - 0.5);
        const randomComments = shuffledComments.slice(0, totalCommentsNeeded);

        console.log(randomComments);
        // Analyze sentiment of each comment
        const scores = randomComments.map((comment) => {
          const commentText =
            comment.snippet.topLevelComment.snippet.textOriginal;
          const result = sentiment.analyze(commentText);
          return { text: commentText, score: result.score };
        });

        setSentimentData(scores.map((s) => s.score)); // Update sentiment data state

        // Extract top 15 comments to show
        setTopComments(scores.slice(0, 15)); // Get top 15 comments based on order

        // Calculate percentages
        const total = scores.length;
        const positiveCount = scores.filter((score) => score.score > 0).length;
        const negativeCount = scores.filter((score) => score.score < 0).length;
        const neutralCount = total - positiveCount - negativeCount;

        setPercentages({
          positive: parseFloat(((positiveCount / total) * 100).toFixed(2)),
          negative: parseFloat(((negativeCount / total) * 100).toFixed(2)),
          neutral: parseFloat(((neutralCount / total) * 100).toFixed(2)),
        });

        // Smooth scroll to the Pie chart container
        pieChartRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch (error) {
        console.error(error);
        toast({
          description: "An error occurred while fetching comments.",
        });
      }
    } else {
      toast({
        description: "Invalid YouTube link.",
      });
      setYoutubeLink("");
    }

    setLoading(false);
  };

  // Fetch popular video thumbnails and titles
  useEffect(() => {
    const fetchVideos = async () => {
      setIsFetchingVideos(true);
      try {
        // First, fetch popular videos
        const popularResponse: any = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?key=${process.env.NEXT_PUBLIC_YOUTUBE_API}&part=snippet&chart=mostPopular&maxResults=5`
        );
        const popularResult = await popularResponse.json();

        // Filter and fetch videos with comments enabled
        const videosWithComments = await Promise.all(
          popularResult.items.map(async (item: any) => {
            const commentResponse: any = await fetch(
              `https://www.googleapis.com/youtube/v3/commentThreads?key=${process.env.NEXT_PUBLIC_YOUTUBE_API}&part=id&videoId=${item.id}&maxResults=1`
            );
            const commentResult = await commentResponse.json();

            if (commentResult.items && commentResult.items.length > 0) {
              return {
                thumbnail: item.snippet.thumbnails.high.url,
                title: item.snippet.title,
                videoId: item.id,
              };
            }
            return null;
          })
        );

        // Filter out null values and limit to 5 videos
        const filteredVideos = videosWithComments
          .filter((v) => v !== null)
          .slice(0, 4);
        setVideos(filteredVideos);
      } catch (error) {
        console.error(error);
      } finally {
        setIsFetchingVideos(false);
      }
    };

    fetchVideos();
  }, []);

  // Data and options for the pie chart
  const pieData = {
    labels: ["Positive", "Negative", "Neutral"],
    datasets: [
      {
        data: [percentages.positive, percentages.negative, percentages.neutral],
        backgroundColor: ["#3ECF3C", "#ff474c", "#808080"],
        hoverOffset: 4,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      tooltip: {
        callbacks: {
          label: function (tooltipItem: any) {
            const label = tooltipItem.label || "";
            const value = tooltipItem.raw || 0;
            return `${label}: ${value}%`;
          },
        },
      },
    },
  };

  const handleThumbnailClick = (videoId: string) => {
    const selectedLink = `https://www.youtube.com/watch?v=${videoId}`;
    navigator.clipboard.writeText(selectedLink);
    toast({
      description: "Copied link to clipboard",
    });
  };

  return (
    <>
      <div className="flex py-20 flex-col items-center justify-center min-h-screen px-4 bg-white text-black">
        <h1 className="text-9xl u md:text-[10rem] xl:text-[12rem] text-center mb-6">
          MoodTube
        </h1>

        <p className="text-md md:text-lg lg:text-xl text-center mb-8 md:mb-10 md:w-[800px]">
          MoodTube is a tool which uses a YouTube video&apos;s comments and
          machine learning to tell you what type of response it&apos;s getting
          without you having to read individual comments. Try it out below.
        </p>

        <div className="flex flex-col md:flex-row       items-center justify-center w-full gap-4 mb-8">
          <Input
            value={youtubeLink}
            onChange={handleInputChange}
            placeholder="Paste a YouTube link here"
            className="w-full md:w-[400px]"
          />
          <Button
            onClick={handleSubmit}
            className=""
            disabled={loading || !youtubeLink}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Analyze
            {!loading && <ChevronRight className=" h-4 w-4" />}
          </Button>
        </div>

        <div className="w-full md:w-[600px] mb-6">
          <label className="block mb-2 text-sm font-medium text-gray-700">
            Number of Comments to Analyze: {sliderValue}
          </label>
          <Slider
            min={1000}
            max={10000}
            step={500}
            value={[sliderValue]}
            onValueChange={(value) => setSliderValue(value[0])}
          />
        </div>

        <h2 className="text-3xl pt-20 font-semibold">
          Try one of these trending videos
        </h2>
        <h2 className="text pb-10 pt-2 text-gray-500">
          These are some of the most popular and latest videos on YouTube right now.
        </h2>
        <div className="w-full">
          <div className="carousel w-full" id="video-carousel">
            {[...Array(Math.ceil(items.length / 4))].map((_, pageIndex) => (
              <div
                key={pageIndex}
                id={`page${pageIndex}`}
                className="carousel-item w-full"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full px-4">
                  {items
                    .slice(pageIndex * 4, (pageIndex + 1) * 4)
                    .map((video, index) => (
                      <div
                        key={isFetchingVideos ? index : video.videoId}
                        className="w-full"
                      >
                        {isFetchingVideos ? (
                          <div>
                            <Skeleton className="w-full aspect-video rounded-md" />
                            <Skeleton className="w-full h-5 mt-2" />
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer"
                            onClick={() => handleThumbnailClick(video.videoId)}
                          >
                            <div className="relative w-full aspect-video">
                              <Image
                                src={video.thumbnail}
                                alt={video.title}
                                layout="fill"
                                objectFit="cover"
                                className="rounded-md shadow-md"
                              />
                            </div>
                            <p className="mt-2 text-sm text-center truncate">
                              {video.title}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center w-full py-2 gap-2">
            {[...Array(Math.ceil(items.length / 4))].map((_, index) => (
              <a
                key={index}
                href={`#page${index}`}
                className={`btn btn-xs ${
                  activeIndex === index ? "btn-active" : ""
                }`}
                onClick={() => setActiveIndex(index)}
              >
                {index + 1}
              </a>
            ))}
          </div>
        </div>

        <div
          ref={pieChartRef}
          className={`w-full md:w-[400px] mb-8 ${
            sentimentData.length == 0 ? "hidden" : ""
          }`}
        >
          <Pie data={pieData} options={pieOptions} />
        </div>

        <div
          className={`w-full md:w-[600px] bg-gray-100 rounded-lg p-4 shadow-md ${
            sentimentData.length == 0 ? "hidden" : ""
          }`}
        >
          <h3 className="text-xl font-semibold mb-4">Top 15 Comments</h3>
          <ul>
            {topComments.length > 0 ? (
              topComments.map((comment, index) => {
                let sentimentLabel = "";
                if (comment.score > 0) sentimentLabel = "Positive";
                else if (comment.score < 0) sentimentLabel = "Negative";
                else sentimentLabel = "Neutral";

                return (
                  <li
                    key={index}
                    className="mb-3 flex justify-between items-center border-b pb-2"
                  >
                    <p className="text-sm">{comment.text}</p>
                    <span
                      className={`${
                        sentimentLabel === "Positive"
                          ? "text-green-500"
                          : sentimentLabel === "Negative"
                          ? "text-red-500"
                          : "text-gray-500"
                      } font-semibold text-sm`}
                    >
                      {sentimentLabel}
                    </span>
                  </li>
                );
              })
            ) : (
              <p className="text-center text-gray-500">
                No comments available.
              </p>
            )}
          </ul>
        </div>
      </div>
      <footer className="footer bg-neutral text-neutral-content items-center p-4">
        <aside className="grid-flow-col items-center">
          <p>
            Made by{" "}
            <a
              className="underline"
              target="_blank"
              href="https://x.com/madebyshaurya"
            >
              Shaurya
            </a>
          </p>
        </aside>
        <nav className="grid-flow-col gap-4 md:place-self-center md:justify-self-end">
          <a
            href="https://github.com/madebyshaurya/MoodTube"
            className="btn btn-ghost btn-sm underline"
            target="_blank"
          >
            Source Code on GitHub
          </a>
        </nav>
      </footer>
    </>
  );
};

export default LandingPage;
